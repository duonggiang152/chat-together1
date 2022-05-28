import express from 'express';
import slug from 'slug';
import dotenv from 'dotenv';
import passport from 'passport';
import bcrypt from 'bcrypt';
import ObjectID from 'mongoose'

import { signToken, verifyToken } from '../helpers/jwt';
import UserModel, { User } from '../models/user.model';
import { IUser, IUserData } from '../types/user.type';
import randomChars from '../helpers/randomChars';
import SocketManager from '../helpers/socketManager';
import uploadavartar from '../helpers/avartarUploadHandle'
import MulterRequest from 'server/types/multerrequest';

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
    const accessToken = signToken(payload, process.env.TOKEN_SECRET || '', process.env.TOKEN_EXPIRESIN || '');
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
    return res.json({ accessToken, refreshToken });
});

Router.post('/api/auth/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const { _id, fullname, username } = await verifyToken(refreshToken, process.env.REFRESH_TOKEN_SECRET || '') as IUserData;
        const user = await UserModel.findOne({ _id, refreshToken });
        if (!user) return res.status(401).json('Unauthorized');
        const accessToken = signToken({ _id, fullname, username }, process.env.TOKEN_SECRET || '', process.env.TOKEN_EXPIRESIN || '');
        return res.json({ accessToken });
    } catch (error) {
        return res.status(401).json('Unauthorized')
    }

})

/**
 * Lấy thông tin người dùng
 */
Router.get('/api/user/profile/', passport.authenticate('jwt', { session: false }), async (req, res) => {
    // route có id thì tìm theo id
    try {
        let ID = req.auth?._id as unknown as string
        // TODO bỏ query
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
            const profile = await UserModel.findOne({ _id: ID }) as any
            if (!profile) return res.status(403).json({ message: "User không tồn tại" })
            profile.password = undefined
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
            let profile = await UserModel.findOne({ _id: ID }) as Partial<IUser>
            if (!profile) return res.status(500).json({ message: "Lỗi hệ thống" })
            delete profile.password
            return res.status(200).json(profile)
        }
    } catch (err) {
        console.log(err)
        return res.status(500).json({ message: "Lỗi hệ thống" })
    }
});
Router.get("/api/user/profile/:id", passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        if (!req.params.id) return res.status(403).json({ message: "ParamID ko dc de trống" })
        const user = await User.getUserByID(req.params.id)
        return res.status(200).json(user)
    }
    catch (err) {
        console.log(err)
        return res.status(500).json({ message: "Lỗi hệ thống" })
    }
})
Router.post("/api/user/profile-list", passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        if (!req.body || !req.body.ids || !req.body.ids)
            return res.status(403).json({ message: "Lỗi body request ko tồn tại ids" })
        const ids = req.body.ids;
        const listUser = await UserModel.find({ _id: { $in: ids } }, {
            _id: 1,
            username: 1,
            fullname: 1,
        });
        return res.status(200).json(listUser)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ message: "Lỗi hệ thống" })
    }
})

Router.put("/api/user/update-profile", passport.authenticate('jwt', { session: false }), uploadavartar.single("avartar"), async (req, res) => {
    try {
        const { username, email, phone, fullname } = req.body
        const id = req.auth?._id as string
        try {
            (req as any).body.avatar = (req as MulterRequest).file.filename
        } catch (err) {
            (req as any).body.avatar = undefined
        }
        await User.changeUserInFo(id, req.body as any)
        return res.status(200).send()
    } catch (err) {
        console.log(err)
        return res.status(500).json({ message: "Lỗi hệ thống" })
    }
})
// Router.get("/api/user/notification", passport.authenticate('jwt', { session: false }), async (req, res) => {
//     try {
//         const userId = req.auth?._id
//         const offsetid = (req.query.offsetid ? req.query.offsetid : false) as string | boolean
//         const limit = req.query.limit
//         await Notification.getNotificationByRange(offsetid, limit, userId)
//             .then(notifications => {
//                 return res.status(200).json(notifications)
//             })
//             .catch(err => {
//                 return res.status(403).json({ message: err.message })
//             })
//     } catch (err) {
//         console.log(err)
//         return res.status(200).json({ message: "Lỗi hệ thống" })
//     }
// })
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
Router.post('/api/login', async (req, res) => {
    // lấy dữ liệu
    const username: string = req.body.username
    const password: string = req.body.password
    if (!username || !password) {
        res.status(404)
        return res.send({ message: "phải có đầy đủ tài khoản và mật khẩu để đăng nhập" })
    }
    // kiểm tra tài khoản tồn tại hay không
    await UserModel.findOne({ username: username })
        .then(async user => {
            // lỗi
            if (!user) {
                res.status(404)
                return res.send({ message: "Tài khoản không tồn tại" })
            }
            // kiểm tra mật khẩu đúng hay sai
            bcrypt.compare(password, user.password, async (err, result) => {
                if (err) {
                    res.status(404)
                    return res.send({ message: "lỗi không xác định" })
                }
                // lỗi
                if (err) {
                    res.status(404)
                    return res.json()
                }
                // result = true : tài khoản và mật khẩu đúng, false ngược lại
                interface PayloadType {
                    _id: string,
                    username: string,
                    fullname: string
                }
                if (result) {
                    const payload : PayloadType = {
                        _id: user._id,
                        username: user.username,
                        fullname: user.fullname
                    }
                    const accessToken = signToken(payload, process.env.TOKEN_SECRET || '', process.env.TOKEN_EXPIRESIN || '');
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
                    return res.status(200).json({ accessToken, refreshToken })
                }
                res.status(404)
                return res.json({ message: "Tài khoản hoặc mật khẩu không đúng" })
            })
        })
})
//----------------------------------------------------------------------
// gợi ý kết bạn

Router.get('/api/user/search', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        const userID = req.auth?._id.toString() as string;
        const { fullname, lastId, isNotFriend } = req.query;
        const fn = fullname;
        const limit = 10;
        let match = {};
        let friends: string[] = [];
        if (fn) match['fullname'] = { $regex: `.*${fullname}.*`, $options: 'i' };
        if (lastId) match['_id'] = { $lt: lastId };
        if (isNotFriend === "true") {
            // TODO bỏ trong phần pending
            const user = await UserModel.findById(userID, { friends: 1, pendingFriendRequest: 1 }).lean();
            if (user) {
                friends = [...user.friends, ...user.pendingFriendRequest, userID];
                match['_id'] = { ...match['_id'], $nin: friends }
            }
        }
        const users = await UserModel.find(match, { _id: 1, username: 1, fullname: 1 }).sort({ createdAt: -1 }).limit(limit).lean();
        const count = await UserModel.count({ _id: { $nin: friends }, fullname: { $regex: `.*${fullname}.*` } });
        return res.status(200).json({ users, count });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Lỗi hệ thống!" });
    }
})
// TODO: bỏ
Router.get('/api/user/create-user', async (req, res) => {
    for (let i = 0; i < 50; i++) {
        await UserModel.create({
            username: 'test' + i,
            fullname: `test${i}@gmail.com`,
            email: `test${i}@gmail.com`,
            password: '$2b$10$CYoxUBmfaApniOkuJc7Kvu.3xDu.YvCbVFOUHkjXEg236lNJBsbIK'
        });
    }
    return res.status(200).json('oke')
})

// // TODO: bỏ
// Router.get('/api/user/randomuser', async (req, res) => {
//     let offsetid;
//     let limit;
//     if (req.query.offsetid) {
//         try {
//             offsetid = req.query.offsetid
//             limit = req.query.limit
//         }
//         catch (err) {
//             return res.status(403).send({ message: "query err" })
//         }
//         const users = await UserModel.find({ '_id': { $gt: new mongoose.Types.ObjectId(offsetid) } }).limit(limit)
//         res.status(200)
//         return res.send(users)
//     }
//     try {
//         limit = req.query.limit ? req.query.limit : 5
//         const user = await UserModel.find({}).limit(limit)
//         const result: Object[] = []

//         for (let i = 0; i < user.length; i++) {
//             const temp = new Object({
//                 id: user[i]._id.toString(),
//                 username: user[i].username,
//                 fullname: user[i].fullname
//             })
//             result.push(temp)
//         }
//         res.status(200)
//         return res.send(result)
//     } catch (err) {
//         res.status(500)
//         return res.send({ message: "Lỗi" })
//     }
// })
export default Router;