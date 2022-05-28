import express from 'express';
import passport from 'passport';
import UserModel, { User } from '../models/user.model';
import RoomModel, { Room } from '../models/room.model';
import SocketIO from '../../server/helpers/socketIO';
import EmtyMemberInRoom from '../../server/helpers/exception/EmtyMemberInRoom';
import RequireAtleastTowMember from '../../server/helpers/exception/RequireAtleastTowMember';
import UnknownFriendRelation from '../../server/helpers/exception/UnknownFriendRelation';
// import { Request, Response } from 'express';
// import IRoom, { IRoomModel } from 'server/types/room.type';
// import { Notification } from '../models/notification.model';
// import SocketManager from '../helpers/socketManager';
const Router = express.Router();
/**
 * Tạo phòng public, và cho phép nhiều thành viên trong phòng
 */
Router.post('/api/room', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        
        const userID = req.auth?._id as string
        const roomInfo = await Room.createGroupRoom(req.body.name, req.body.memberIDs, userID) as unknown as Object
        // gửi socket
        let groupMemberIDs = req.body.memberIDs as String[]
        groupMemberIDs.push(userID)
        const currentSocket = req.headers['x-exclude-socket-id'] as string;
        groupMemberIDs.forEach((memberID ) => {
            User.EventToUser(memberID as string, 'room-notification', {...roomInfo}, [currentSocket] )
        })
        return res.status(200).json(roomInfo)
    } catch (err) {
        if(err instanceof EmtyMemberInRoom || err instanceof RequireAtleastTowMember ) 
            return res.status(403).json({errcode: 1, message: "Không tồn tại danh sách memberIDs hoặc memberIDs có ít hơn 2 người"})
        if(err instanceof UnknownFriendRelation) 
            return res.status(403).json({errcode: 2, message: 'Phải là bạn thì mới tạo được phòng'})
        console.log(err);
        return res.status(500).json({ message: "lỗi hệ thống" })
    }
})
/**
 * Thêm thành viên vào phòng
 */
// Router.post("/api/room/add-member/:roomid/:userid", passport.authenticate('jwt', { session: false }), async (req, res) => {
//     // khoi tao bien cuc bo
//     try {
//         const userID = req.auth?._id.toString() as string
//         const userAdd = req.params.userid
//         const roomAdd = req.params.roomid
//         const userFriend = await User.getFriend(userID)
//             .catch(err => {
//                 return res.status(403).json({ message: err.message })
//             }) as string[] | null
//         if (!userFriend || !userFriend.includes(userAdd)) return res.status(403).json({ message: "User ko phải bạn của bạn" })

//         let addErr = false
//         await Room.addMoreUserToGroup(userAdd, roomAdd, userID)
//             .catch(err => {
//                 addErr = true;
//                 return res.status(403).json({ message: err.message })
//             })
//         if (addErr) return
//         // thông báo đến user nếu online
//         const owner = await Room.getRoomOwner(roomAdd)
//         if (owner) {
//             const sockets = await SocketManager.getSockets(owner)
//             sockets.forEach(socket => {
//                 req.io.to(socket).emit("new-notification", {
//                     type: "request-add-room-member",
//                     roomID: roomAdd,
//                     userAdd: userAdd,
//                     userRequire: userID
//                 })
//             })
//         }
//         return res.status(200).json({ message: "them thanh vien thanh cong" })
//     } catch (err) {
//         console.log(err)
//         return res.status(500).json({ message: "Lỗi hệ thống" })
//     }
// })
// /**
//  * Chấp nhận yêu cầu vào phòng
//  */
// Router.post("/api/room/accept-require-add-member/:roomid/:userrequireid/:useraddid", passport.authenticate('jwt', { session: false }), async (req, res) => {
//     try {
//         const userID = req.auth?._id.toString() as string
//         const roomID = req.params.roomid
//         const userrequireid = req.params.userrequireid
//         const useraddid = req.params.useraddid
//         let gotErr = false
//         await Notification.acceptRequireAddMember(userID, userrequireid, useraddid, roomID)
//             .catch(err => {
//                 gotErr = true
//                 return res.status(403).json({ message: err.message })
//             })

//         if (gotErr) return
//         // thông báo đến toàn bộ user là room update thành công
//         const members = await Room.getMemberInRoom(roomID);
//         members.forEach(async (member) => {
//             const sockets = await SocketManager.getSockets(member)
//             sockets.forEach(socket => {
//                 req.io.to(socket).emit("add-member", {
//                     roomID: roomID,
//                     memberAdd: useraddid
//                 })
//             })
//         })
//         return res.status(200).json({ message: "Chấp nhận yêu cầu thành công" })

//     }
//     catch (err) {
//         return res.status(500).json({ message: "Lỗi hệ thống" })
//     }
// })
// /**
//  * Lấy về toàn bộ room mà user tham gia
//  * example
//  * /api/room    : lấy về 10 phòng đầu tiên
//  * /api/room/?offsetid=idphongthaydoicuoicungphiaclient&limit=sophonglay
//  */
// Router.get('/api/room/get-room/', passport.authenticate('jwt', { session: false }), async (req: Request, res: Response) => {
//     interface RoomQuery {
//         offsetid?: string,
//         limit?: number
//     };
//     try {
//         let query: RoomQuery = req.query as unknown as RoomQuery
//         query.limit = parseInt(query.limit as unknown as string)
//         const userID: string = req.auth!._id.toString()
//         // kiểm tra user có tồn tại hay không
//         const user = await UserModel.findOne({ '_id': userID })
//         if (!user)
//             return res.status(403).json({ nessage: "user không tồn tại" })
//         if (!query.limit) query.limit = 10

//         let rooms: IRoomModel[];
//         if (!query.offsetid) {
//             rooms = await RoomModel.find({ userIDs: { "$in": userID } }).sort({ lastChange: -1 }).limit(query.limit)

//         }
//         else {
//             // get room 
//             const room = await Room.getRoomById(query.offsetid)
//             rooms = await RoomModel.find(
//                 {
//                     userIDs: { "$in": userID },
//                     lastChange: { $lt: room.lastChange }
//                 })
//                 .sort({ lastChange: -1 })
//                 .limit(query.limit)
//         }
//         const result = await Promise.all(rooms.map(async room => {
//             const lastmessage = await Room.lastRoomMessage(room) as any
//             const roomData = {
//                 roomInfo: room,
//                 lastMessage: (lastmessage ? {
//                     ...lastmessage["_doc"]
//                 } :
//                     null)

//             }
//             return roomData
//         }))
//         return res.status(200).json(result)
//     } catch (err) {
//         console.log(err)
//         return res.status(500).json({ nessage: "Lỗi" })
//     }

// })

export default Router;