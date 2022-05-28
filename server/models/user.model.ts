import mongoose from 'mongoose';
import { Schema, model } from 'mongoose';
import SocketIO from '../helpers/socketIO';
import SocketManager from '../helpers/socketManager';
import { IUser } from '../types/user.type';
import RoomModel, { Room } from './room.model';
import console from 'console';
import UserNotExist from '../helpers/exception/UserNotExist';
import RequestNotExist from '../helpers/exception/RequestNotExist';
// import NotificationModel from './notification.model';
import TransactionErr from '../helpers/exception/TransactionErr';
import UnknownFriendRelation from '../helpers/exception/UnknownFriendRelation';
const UserSchema = new Schema<IUser>({
    username: {
        type: String,
        required: true
    },
    fullname: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    friends: [
        {
            type: String
        }
    ],
    avatar: {
        type: String
    },
    pendingFriendRequest : [
        {
            type: String
        }
    ],
    friendRequestSent: [
        {
            type: String
        }
    ],
    phone: {
        type: String
    },
    refreshToken: {
        type: String
    },
}, { timestamps: true });
const UserModel = model<IUser>('users', UserSchema);
/**
 * Hỗ trợ truy xuất dữ liệu
 */
class User {
    /**
     * Lấy toàn bộ bạn của user 
     * @param userID
     * @returns string[]
     */
    static async getFriend(userID: string) {
        const user = await UserModel.findOne({_id: userID})
        if(user === null) throw new Error("User Không tồn tại")
        return user.friends
    }
    /**
     * Lấy toàn bộ bạn của user 
     * @param userID
     * @returns object
     */
    // TODO: bỏ vì đã có findById
    static async getUserByID(userID: string) {
        const user = await UserModel.findOne({_id: userID})
        return user
    }
    /**
     * Lấy toàn bộ phòng mà user tham gia
     * @param userID 
     * @returns 
     */
    static async getAllRoom(userID) {
        return await RoomModel.find({userIDs: {$in: userID}})
                                     .catch(err => {
                                         console.log(err)
                                         return []
                                     })
    }
    static async changeUserInFo(userID, {email, phone, avatar, fullname}) {
        const user = await this.getUserByID(userID)
        if(!user) throw new Error("User ko tồn tại")
        // đánh dấu xem có cần thiết thông báo với bạn bè ko
        let sendEvent = false
        if(avatar || fullname) {
            sendEvent = true
        }
        if(email) user.email = email
        if(phone) user.phone = phone
        if(avatar) user.avatar = avatar
        if(fullname) user.fullname = fullname
        await user.save()
        if(sendEvent) {
            const user = await this.getUserByID(userID)
            const {id, fullname, avatar, email, phone} = user as any
            const sockets:string[] = []
            const rooms = await User.getAllRoom(user?.id) as any
           
            if(!rooms) return
            for(let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
                const room = rooms[roomIndex]
                const members = room.userIDs
                for(let memberIndex = 0; memberIndex < members.length; memberIndex++ ) {
                    const member = members[memberIndex]
                    const l_sockets:string[] = await SocketManager.getSockets(member) as Array<string>|any
                    if(!l_sockets) return
                    for(let i = 0; i < l_sockets.length ; i++) {
                        if(!sockets.includes(l_sockets[i])) sockets.push(l_sockets[i])
                    }
                }
            }
            sockets.forEach(socket => {
                SocketIO.sendEvent("change-info", {id, fullname,avatar, email, phone}, socket)
            })
            
        }
        return
    }
    /**
     * Thay đổi thông tin của User
     * @param io 
     * @param userID 
     * @param eventName 
     * @param data 
     * @returns 
     */
    /**
     * Gửi event đến client
     * @param userID 
     * @param eventName 
     * @param data 
     * @param exclude Danh sách socketID mà ko muốn gửi đến
     * @returns 
     */
    static async EventToUser(userID: string, eventName: string, data: object, exclude: string[] = []) {
        try {
        const sockets = await SocketManager.getSockets(userID)
                                        .catch(err => {
                                            console.log(err)
                                            return null
                                        })
        if(!sockets || !sockets.length || sockets.length === 0) return
        sockets.forEach(socket => {
            if (!exclude.includes(socket)) SocketIO.sendEvent(eventName, data, socket)
        })
        } catch(err) {
            console.log("ERR: Lỗi hệ thống")
            console.log(err)
            return
        }
    }
    /**
     * hủy lời mời kết bạn
     * @param userID  
     * @param userTakeRequest
     * 
     * @err UserNotExist, TransactionErr, RequestNotExist
     */
    static async RemoveFriendRequest(userID, userTakeRequestID) {
        // kiểm tra tính xác thực input
        const user = await UserModel.findById(userID)
        if(!user) {
            console.error("Err: User không tồn tại")
            throw new UserNotExist()
        }
        const userTakeRequest = await UserModel.findById(userTakeRequestID)
        if(!userTakeRequest) {
            console.error("Err: User bạn muốn hủy lời mời kết bạn không tồn tại")
            throw new UserNotExist()
        }
        // kiểm tra xem đã gửi lời kết bạn chưa
        let isSend = false
        const friendRequestSent = user.friendRequestSent
        for(let i = 0; i < friendRequestSent.length; i++) {
            if(friendRequestSent[i] === userTakeRequestID) {
                isSend = true;
                break;
            }
        }
        if(!isSend) throw new RequestNotExist()
        const session = await mongoose.startSession()
        // xóa friendrequest
        try {
        session.withTransaction(async () => {
            // xóa friend request phía người gửi
            await UserModel.findOneAndUpdate({_id: userID}, {
                $pull: {
                    friendRequestSent: userTakeRequestID
                }
            })
            // xóa friend request phía người nhận
            await UserModel.updateOne({_id: userTakeRequestID}, {
                $pull: {
                    pendingFriendRequest: userID
                }
            })
            // // xóa notification
            // await NotificationModel.deleteOne({
            //     userID: userTakeRequestID,
            //     "infoNoti.nt": "friend-request",
            //     "infoNoti.userSent": userID
            // })
        })
        } catch(err) {
            console.log("Err: Transaction ERR")
            throw new TransactionErr()
        } finally {
            await session.endSession()
        } 
        return
    }
    /**
     * Không chấp nhận lời mời kết bạn
     * @param userID
     * @param userSentRequestID
     * @err UserNotExist, TransactionErr, RequestNotExist
     */
    static async DenieFriendRequest(userID, userSentRequestID) {
        // kiểm tra tính xác thực input
        const user = await UserModel.findOne({_id: userID})
        if(!user) {
            console.log("ERR: User không tồn tại")
            throw new UserNotExist()
        }
        const userSentRequest = await UserModel.findOne({_id: userSentRequestID})
        if(!userSentRequest) {
            console.log("ERR: User gửi friend-request không tồn tại")
            throw new UserNotExist()
        }
        // kiểm tra lời mời kết bạn có tồn tại không
        let isSend = false
        const pendingFriendRequest = user.pendingFriendRequest;
        for(let i = 0; i < pendingFriendRequest.length; i++) {
            if(pendingFriendRequest[i] === userSentRequestID) {
                isSend = true
                break
            }
        }
        if(!isSend) throw new RequestNotExist()
        const session = await mongoose.startSession()
        try {
            session.withTransaction(async () => {
                await UserModel.updateOne({_id: userID}, {
                    $pull: {
                        pendingFriendRequest: userSentRequestID
                    }
                })
                await UserModel.updateOne({_id: userSentRequestID}, {
                    $pull: {
                        friendRequestSent: userID
                    }
                })
                // await NotificationModel.deleteOne({
                //     userID: userID,
                //     "infoNoti.nt": "friend-request",
                //     "infoNoti.userSent": userSentRequestID
                // })
            })
        }
        catch(err) {
            console.log("ERR: transaction err")
            throw new TransactionErr()
        }
        finally {
            await session.endSession()
        }
        return
    }
    /**
     * Loại bỏ user ra khỏi danh sách bạn bè
     * @param userID
     * @param removeID
     * @err UserNotExist, UnknownFriendRelation, TransactionErr
     */
    static async RemoveFriend(userID, removeID) {
        // xác thực thông tin
        const user = await UserModel.findOne({_id: userID})
        if(!user) {
            console.log("ERR: User không tồn tại")
            throw new UserNotExist()
        }
        const removeUser = await UserModel.findOne({_id: removeID})
        if(!removeUser) {
            console.log("ERR: Userremove không tồn tại")
            throw new UserNotExist()
        }
        // xác minh xem đã là bạn bè chưa
        const friends = user.friends
        if(!friends.includes(removeID)) throw new UnknownFriendRelation()
        // xóa
        const session = await mongoose.startSession()
        try{
            session.withTransaction(async () => {
                await UserModel.updateOne({_id: userID}, {
                    $pull: {
                        friends: removeID
                    }
                })
                await UserModel.updateOne({_id: removeID}, {
                    $pull: {
                        friends: userID
                    }
                })
                // await NotificationModel.deleteOne({
                //     userID: userID,
                //     "infoNoti.nt": "friend-request",
                //     "infoNoti.userSent": removeID
                // })
                // await NotificationModel.deleteOne({
                //     userID: removeID,
                //     "infoNoti.nt": "friend-request",
                //     "infoNoti.userSent": userID
                // })
                // await NotificationModel.deleteOne({
                //     userID: userID,
                //     "infoNoti.nt": "accepted-friend-request",
                //     "infoNoti.userSent": removeID
                // })
                // await NotificationModel.deleteOne({
                //     userID: removeID,
                //     "infoNoti.nt": "accepted-friend-request",
                //     "infoNoti.userSent": userID
                // })
            })
        }
        catch(err) {
            console.log("ERR: Transaction ERR")
            throw new TransactionErr()
        }
        finally {
            session.endSession()
        }
        return
    }
}
export default UserModel;
export {User}