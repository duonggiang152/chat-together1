import express from 'express';
import slug from 'slug';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import passport from 'passport';
import bcrypt from 'bcrypt';

import { signToken, verifyToken } from '../helpers/jwt';
import UserModel from '../models/user.model';
import { IUserData } from '../types/user.type';
import randomChars from '../helpers/randomChars';

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
    const { refreshToken } = req.body;
    const { _id, fullname, username } = await verifyToken(refreshToken, process.env.REFRESH_TOKEN_SECRET || '') as IUserData;
    const user = await UserModel.findOne({ _id, refreshToken });
    if (!user) return res.status(401).json('Unauthorized');
    const token = signToken({ _id, fullname, username }, process.env.TOKEN_SECRET || '', process.env.TOKEN_EXPIRESIN || '');
    return res.json({ token });
})

/**
 * Lấy thông tin người dùng
 * thuộc tính của response: 
 *      'Content-type' : 'application/json'
 * body của request
 * 
 */
Router.get('/api/user/profile', passport.authenticate('jwt', { session: false  }), async (req, res) => {
    return res.json(req.auth);
});

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
Router.post('/api/register',async (req, res) => {
    const username:string = req.body.username
    const fullname:string = req.body.fullname
    const password:string = req.body.password
    const email:string    = req.body.email
    const phone:string    = req.body.phone
    if(!username || !password ||!fullname || !email || !phone) {
        res.status(404)
        return res.send({message: "Không được bỏ trống ô"})
    }
    try {
    // kiểm tra user tồn tại
    await UserModel.find({username: username})
    .then(async data => {
        if(data.length !== 0) {
            res.status(404)
            return res.send({message: "user đã tồn tại"})
        }
         // khởi tạo password mởi được hash dựa trên password ban đầu
        const hashpassword:string = bcrypt.hashSync(password,parseInt(process.env.SALT_ROUNDS || '', 10))
        // luu du lieu vao trong database
        const newuser = await new UserModel({ username: username,
                                        fullname: fullname,
                                        password: hashpassword,
                                        email: email,
                                        phone: phone})
                            .save()
                            .then(() => {
                                res.status(200)
                                return res.send({message: "Đăng ký thành công"})
                            })
    })
    } catch(err){
        res.status(404)
        return res.send({message: "Lỗi không xác định"})
    }
})


/**
 * Login route
 */
Router.post('/api/login', async (req, res) => {
    // lấy dữ liệu
    const username:string = req.body.username
    const password:string = req.body.password
    if(!username || !password) {
        res.status(404)
        return res.send({message: "phải có đầy đủ tài khoản và mật khẩu để đăng nhập"})
    }
    // kiểm tra tài khoản tồn tại hay không
    await UserModel.findOne({username: username})
                    .then(async user => {
                        // lỗi
                        if(!user){
                            res.status(404)
                            return res.send({message: "Tài khoản không tồn tại"})
                        }
                        // kiểm tra mật khẩu đúng hay sai
                        bcrypt.compare(password, user.password,async (err, result) => {
                            if(err) {
                                res.status(404)
                                return res.send({message: "lỗi không xác định"})
                            }
                            // lỗi
                            if(err) {
                                res.status(404)
                                return res.json()
                            }
                            // result = true : tài khoản và mật khẩu đúng, false ngược lại
                            if(result) {
                                const payload = {
                                    _id : user._id,
                                    username: user.username,
                                    fullname: user.fullname
                                }
                                const token =await signToken(payload, process.env.TOKEN_SECRET || '', process.env.TOKEN_EXPIRESIN || '');

                                res.status(200)
                                return res.send({accessTocken: token})
                            }
                            res.status(404)
                            return res.json({message: "Tài khoản hoặc mật khẩu không đúng"})
                        })
                    })  
})
export default Router;