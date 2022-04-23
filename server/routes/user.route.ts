import express from 'express';
import slug from 'slug';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import passport from 'passport';
import bcrypt from 'bcrypt';
import ObjectID from 'mongoose'

import { signToken, verifyToken } from '../helpers/jwt';
import UserModel from '../models/user.model';
import { IUser, IUserData } from '../types/user.type';
import randomChars from '../helpers/randomChars';
import SocketManager from '../helpers/socketManager';
import { Notification } from '../models/notification.model'
dotenv.config();
const Router = express.Router();
/**
 * URL cho việc login bằng database
 */
Router.post('/api/auth/sign-in-with-social', async (req, res) => {
	const { displayName, email } = req.body;
	const userData = await UserModel.findOne({ email }, { _id: 1, fullname: 1, username: 1 }).lean();
	let payload: IUserData = {
		_id: '',
		fullname: '',
		username: ''
	}
	if (userData) payload = userData;
	else {
		const newUser = await UserModel.create({
			fullname: displayName,
			email,
			username: slug(displayName),
			password: bcrypt.hashSync(randomChars(10), parseInt(process.env.SALT_ROUNDS || '', 10))
		})
		payload = {
			_id: newUser._id,
			fullname: newUser.fullname,
			username: newUser.username
		}
	}
	const token = signToken(payload, process.env.TOKEN_SECRET || '', process.env.TOKEN_EXPIRESIN || '');
	let refreshToken = '';
	// kiem tra xem refreshToken trong db co hop le hay khong, neu khong tao cai moi va luu vao db
	try {
		const user = await UserModel.findOne({ _id: payload._id }, { refreshToken: 1 });
		if (!user) return res.status(401).json('Unauthorized');
		await verifyToken(user.refreshToken, process.env.REFRESH_TOKEN_SECRET || '');
		refreshToken = user.refreshToken;
	} catch (error) {
		refreshToken = signToken(payload, process.env.REFRESH_TOKEN_SECRET || '', process.env.REFRESH_TOKEN_EXPIRESIN || '');
		await UserModel.updateOne({ _id: payload._id }, { refreshToken });
	}
	return res.json({ token, refreshToken });
});

Router.post('/api/auth/refresh-token', async (req, res) => {
	try {
		const { refreshToken } = req.body;
		const { _id, fullname, username } = await verifyToken(refreshToken, process.env.REFRESH_TOKEN_SECRET || '') as IUserData;
		const user = await UserModel.findOne({ _id, refreshToken });
		if (!user) return res.status(401).json('Unauthorized');
		const token = signToken({ _id, fullname, username }, process.env.TOKEN_SECRET || '', process.env.TOKEN_EXPIRESIN || '');
		return res.json({ token });
	} catch {
		return res.status(500).json({ message: "Server error"});
	}
})

/**
 * Lấy thông tin người dùng
 */
Router.get('/api/user/profile/', passport.authenticate('jwt', { session: false }), async (req, res) => {
	// route có id thì tìm theo id
	try {
		// TODO
		let ID = req.auth?._id as unknown as string
		if (ID === req.query.id) req.query.id = undefined
		if (req.query.id) {
			ID = req.query.id as unknown as string
			const isvalidID = ObjectID.isValidObjectId(ID)
			if (!isvalidID)
				return res.status(403).json({ message: "Mã người dùng không hợp lệ" })
			// Danh sach ban của người gửi request
			const friendsID = await UserModel.findOne({ _id: req.auth?._id })
				.then(data => {
					if (!data) return []
					return data.friends
				})
			const isFriend = friendsID.includes(ID)
			const profile = await UserModel.findOne({ _id: ID })
			if (!profile) return res.status(403).json({ message: "User không tồn tại" })
			// Kiểm tra user online 
			const isOnline = await SocketManager.isOnline(ID)
			if (isFriend) {
				return res.status(200).json({
					username: profile.username,
					fullname: profile.fullname,
					email: profile.email,
					phone: profile.phone,
					onlinestatus: isOnline
				})
			}
			else {
				return res.status(200).json({
					username: profile.username,
					fullname: profile.fullname,
				})
			}

		}
		// route không có id không trả về thông tin của người của người gọi
		else {
			const ID = req.auth?._id
			let profile = await UserModel.findOne({ _id: ID }, {
				username: 1,
				fullname: 1,
				email: 1,
				phone: 1,
				pendingFriendRequest: 1,
				friendRequestSent: 1,
				friends: 1
			}) as Partial<IUser>
			if (!profile) return res.status(500).json({ message: "Lỗi hệ thống" })
			delete profile.password
			return res.status(200).json(profile)
		}
	} catch (err) {
		console.log(err)
		return res.status(500).json({ message: "Lỗi hệ thống" })
	}
});

Router.get("/api/user/notification", passport.authenticate('jwt', { session: false }), async (req, res) => {
	try {
		const userId = req.auth?._id
		const offsetid = (req.query.offsetid ? req.query.offsetid : false) as string | boolean
		const limit = req.query.limit
		await Notification.getNotificationByRange(offsetid, limit, userId)
			.then(notifications => {
				return res.status(200).json(notifications)
			})
			.catch(err => {
				return res.status(403).json({ message: err.message })
			})
	} catch (err) {
		console.log(err)
		return res.status(200).json({ message: "Lỗi hệ thống" })
	}
})
/**
 * Register route
 * cần phải gửi đủ 5 trường 
 * --------------------
 * REQUEST
 * POST      /api/register
 * Request header:
 *          content-type: application/json
 * 
 * Request body:
 *          username
 *          fullname
 *          password
 *          email
 *          phone
 * Success
 *          status: 200
 * Error
 *          status: 4xx
 * 
 * 
 */
Router.post('/api/register', async (req, res) => {
	const username: string = req.body.username
	const fullname: string = req.body.fullname
	const password: string = req.body.password
	const email: string = req.body.email
	const phone: string = req.body.phone
	if (!username || !password || !fullname || !email || !phone) {
		res.status(404)
		return res.send({ message: "Không được bỏ trống ô" })
	}
	try {
		// TODO bỏ then
		// kiểm tra user tồn tại
		await UserModel.find({ username: username })
			.then(async data => {
				if (data.length !== 0) {
					res.status(404)
					return res.send({ message: "user đã tồn tại" })
				}
				// khởi tạo password mởi được hash dựa trên password ban đầu
				const hashpassword: string = bcrypt.hashSync(password, parseInt(process.env.SALT_ROUNDS || '', 10))
				// luu du lieu vao trong database
				const newuser = await new UserModel({
					username: username,
					fullname: fullname,
					password: hashpassword,
					email: email,
					phone: phone
				})
					.save()
					.then(() => {
						res.status(200)
						return res.send({ message: "Đăng ký thành công" })
					})
			})
	} catch (err) {
		res.status(404)
		return res.send({ message: "Lỗi không xác định" })
	}
})

/**
 * Login route
 */
// TODO sửa lại status code
Router.post('/api/login', async (req, res) => {
	// lấy dữ liệu
	const username: string = req.body.username
	const password: string = req.body.password
	if (!username || !password) {
		res.status(404)
		return res.send({ message: "phải có đầy đủ tài khoản và mật khẩu để đăng nhập" })
	}
	// TODO bỏ then
	// kiểm tra tài khoản tồn tại hay không
	const user = await UserModel.findOne({ username: username });
	if (!user) return res.status(400).json({ message: "Tài khoản hoặc mật khẩu không chính xác" });
	const checkPassword = bcrypt.compare(password, user.password);
	if (!checkPassword) return res.status(400).json({ message: "Tài khoản hoặc mật khẩu không chính xác" });
	const payload = {
		_id: user._id,
		username: user.username,
		fullname: user.fullname
	};
	const token = signToken(payload, process.env.TOKEN_SECRET || '', process.env.TOKEN_EXPIRESIN || '');
	let refreshToken = '';
	// kiem tra xem refreshToken trong db co hop le hay khong, neu khong tao cai moi va luu vao db
	try {
		const u = await UserModel.findOne({ _id: payload._id }, { refreshToken: 1 });
		if (!u) return res.status(401).json('Unauthorized');
		await verifyToken(u.refreshToken, process.env.REFRESH_TOKEN_SECRET || '');
		refreshToken = u.refreshToken;
	} catch (error) {
		refreshToken = signToken(payload, process.env.REFRESH_TOKEN_SECRET || '', process.env.REFRESH_TOKEN_EXPIRESIN || '');
		await UserModel.updateOne({ _id: payload._id }, { refreshToken });
	}
	res.status(200).json({ token, refreshToken });
})
// TODO bỏ 2 cái dưới, chuyển thành search
//----------------------------------------------------------------------
// gợi ý kết bạn
Router.get('/api/user/similarname/:name', async (req, res) => {
	const name = req.params.name
	const user = await UserModel.find({ username: { $regex: `^${name}` } }).limit(10)
	let result: Object[] = []
	for (let i = 0; i < user.length; i++) {
		result.push({
			id: user[i]._id.toString(),
			username: user[i].username,
			fullname: user[i].fullname
		})
	}
	return res.status(200).json(result)
})

Router.get('/api/user/randomuser', async (req, res) => {
	let offsetid;
	let limit;
	if (req.query.offsetid) {
		try {
			offsetid = req.query.offsetid
			limit = req.query.limit
		}
		catch (err) {
			return res.status(403).send({ message: "query err" })
		}
		const users = await UserModel.find({ '_id': { $gt: new mongoose.Types.ObjectId(offsetid) } }).limit(limit)
		res.status(200)
		return res.send(users)
	}
	try {
		limit = req.query.limit ? req.query.limit : 5
		const user = await UserModel.find({}).limit(limit)
		const result: Object[] = []

		for (let i = 0; i < user.length; i++) {
			const temp = new Object({
				id: user[i]._id.toString(),
				username: user[i].username,
				fullname: user[i].fullname
			})
			result.push(temp)
		}
		res.status(200)
		return res.send(result)
	} catch (err) {
		res.status(500)
		return res.send({ message: "Lỗi" })
	}
})
export default Router;