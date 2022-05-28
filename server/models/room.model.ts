import { Schema, model, Types } from 'mongoose';
import RequireAtleastTowMember from '../../server/helpers/exception/RequireAtleastTowMember';
import EmtyMemberInRoom from '../../server/helpers/exception/EmtyMemberInRoom';
import { IRoomModel }  from '../types/room.type';
import UserModel, { User } from './user.model';
import UserNotExist from '../../server/helpers/exception/UserNotExist';
import UnknownFriendRelation from '../../server/helpers/exception/UnknownFriendRelation';
import PrivateGroupExist from '../../server/helpers/exception/PrivateGroupExist';
import RoomNotExist from '../../server/helpers/exception/RoomNotExist';
import UserWasNotMemberOfRoom from '../../server/helpers/exception/UserWasNotMemberOfRoom';
import MessageModel from './message.model';
import { Message } from './message.model';
import MessageNotExist from '../../server/helpers/exception/MessageNotExist';


const RoomSchema = new Schema<IRoomModel>({
    name: {
        type: String
    },
    // true : nhóm public
    // false: nhóm private 
    isGroup: {
        type: Boolean,
        default: true
    },
    userIDs: [{
        type: String
    }], 
    ownerID: {
        type: String,
        transform: (v: any) => v == null ? '' : v
    },
    avatar: {
        type: String
    },
    settings: {},
    lastChange: {
        tyoe: Date
    },
    lastReadMessageByUsers: {
        type: [
            {
                userID: String,
                lastMessageID: String
            }
        ]
    }
}, { timestamps: true });
const RoomModel = model<IRoomModel>('rooms', RoomSchema);
export default RoomModel;
/**
 * Suport tương tác với Room model
 */
class Room {
    /**
     * update thuộc tính lastChange của room mỗi khi có người nhắn tin 
     * @param room 
     */
    static async updateLastChange(room: IRoomModel) {
        room.lastChange = new Date()
        await room.save()
    }
    /**
     * Lấy tin nhắn cuối cùng của phòng
     * -- có thể gây lỗi chờ nhau không ????
     * @param room 
     */
    // static async lastRoomMessage(room: IRoomModel){
    //     const message = await MessageModel.findOne({roomID: room._id}).sort({createdAt: -1})
    //     return message;
    // }
    static async getRoomById(roomID: string){
        const room = await RoomModel.findOne({_id: roomID})
        if(!room) throw new RoomNotExist()
        return room;
    }
    static async getMemberInRoom(roomID:string){
        const room = await RoomModel.findById(roomID)
        return room?.userIDs
    }
    static async idUserInGroup(userID:string, roomID: string){
        const room = await RoomModel.findById(roomID)
        const member = room?.userIDs
        if(member?.includes(userID)) return true
        return false
    }
    /**
     * Update trạng thái tin nhắn cuối cùngcủa người đọc
     * @param roomID 
     * @param userID 
     * @param lastMessageID 
     */
    static async updateLastReadMessageOfUser(roomID: string, userID: string, lastMessageID: string) {
        if(!(await Room.idUserInGroup(userID, roomID))) throw new UserWasNotMemberOfRoom()
        const message = await Message.getMessage(lastMessageID)
        if(message.roomID !== roomID) throw new MessageNotExist()
        // cập nhật
        // check xem room có properties lastReadMessageByUsers không vì có thể khi khởi tạo bị bỏ quên, sẽ fix sau
        const room = await Room.getRoomById(roomID)
        let lastReadMessageList:any = room.lastReadMessageByUsers
        if(!lastReadMessageList || lastReadMessageList.length === 0) {
            lastReadMessageList = []
            const members = room.userIDs
            for(let i = 0; i < members.length; i++) {
                lastReadMessageList.push({
                    userID: members[i].toString(),
                    lastMessageID: undefined
                })
            }
        }
        for(let i = 0 ; i < lastReadMessageList.length; i++) {
            if(lastReadMessageList[i].userID === userID) {
                if(!lastReadMessageList[i].lastMessageID) {
                    lastReadMessageList[i].lastMessageID = lastMessageID;
                    room.lastReadMessageByUsers = [...lastReadMessageList]
                    await room.save()
                    return true;
                    }
                if(lastReadMessageList[i].lastMessageID===lastMessageID) return false
                // Kiểm tra xem lastMessageID xh trước hay message ban đầu xuất hiện trước
                const messageInDB = await Message.getMessage(lastReadMessageList[i].lastMessageID)
                const messageInput = await Message.getMessage(lastMessageID)
                const messageInDBDate = new Date(messageInDB.createdAt).valueOf()
                const messageInputDate    = new Date(messageInput.createdAt).valueOf()
                if(messageInDBDate >= messageInputDate) return false
                lastReadMessageList[i].lastMessageID=lastMessageID
                room.lastReadMessageByUsers = [...lastReadMessageList]
                await room.save()
                return true
            }
        }
    }
    // static async getRoomOwner(roomID: string) {
    //     const room = await Room.getRoomById(roomID)
    //     if(!room.isGroup) throw new Error("Phòng cá nhân không thể thêm thành viên")
    //     return room.ownerID
    // }
    // /**
    //  * Trực tiếp add Member đến room không xét điều kiện ngoài
    //  * @param userID 
    //  * @param roomID 
    //  */
    // static async addMember(userID: string, roomID: string){
    //     const room = await Room.getRoomById(roomID)
    //     const member = room.userIDs;
    //     if(member.includes(userID)) return
    //     member.push(userID)
    //     room.userIDs = [...member]
    //     await room.save()
    //     return
    // }

    // static async addMoreUserToGroup(userAddToRoomID: string,roomID: string, userRequestAddMemberID: string) {
    //     const ownerID = await Room.getRoomOwner(roomID) as string
    //     const roomMembers = await Room.getMemberInRoom(roomID)
    //     const userAdd     = await User.getUserByID(userAddToRoomID)
    //     if(!userAdd) throw new Error("user không tồn tại")
    //     if(!roomMembers.includes(userRequestAddMemberID)) throw new Error("Không phải thành viên của phòng")
    //     if(ownerID === userRequestAddMemberID) {
    //         await Room.addMember(userAddToRoomID, roomID)
    //         return
    //     }
    //     // Gửi thông báo đến chủ phòng
    //     await Notification.sendNotificationRequireAddRoomMember(ownerID, userRequestAddMemberID, userAddToRoomID, roomID)
    // }
    /**
     * Tạo một private group chỉ có 2 thành viên này tham gia
     * @param firstMemberID 
     * @param secondMemberID 
     * @excpetion UserNotExist, PrivateGroupExist
     */
    static async createPrivateRoom(firstMemberID: string, secondMemberID: string): Promise<Object> {
        const fristMember = await User.getUserByID(firstMemberID)
        const secondMember = await User.getUserByID(secondMemberID)
        if(!fristMember && !secondMember) throw new UserNotExist()
        // kiểm tra xem private group này đã tồn tại chưa
        const isExistGroup = await RoomModel.findOne({
            $and: [
                {
                    userIDs: { $in: [fristMember?._id] },
                },
                {
                    userIDs: { $in: [secondMember?._id] },
                }, {
                    isGroup: false

                }
            ]
        });
        if(isExistGroup) throw new PrivateGroupExist()
        // tạo phòng
        const room = new RoomModel({
            isGroup: false,
            userIDs: [fristMember?._id, secondMember?._id],
            settings: {
            },
            lastChange: new Date(),
        })
        const roomdata = room;
        room.save()
                  .then(room => {
                      Room.updateLastChange(room)
                  })
        return roomdata
        
        
    }
    /**
     * Tạo một room, room này chủ phòng có quyền add nhiều người
     * @async
     * @param name 
     * @param memberIDs 
     * @param ownerID 
     * @exception EmtyMemberInRoom, RequireAtleastTowMember, UnknownFriendRelation
     */
    static async createGroupRoom(name: string | undefined, memberIDs: string[], ownerID: string ) {
        if(typeof(memberIDs) !== typeof([])) throw new EmtyMemberInRoom()
        if(memberIDs.length === 0) throw new RequireAtleastTowMember()
        const owner = await User.getUserByID(ownerID)
        if(!owner) throw new UserNotExist()
        if(!name) name = `Nhóm của: ${owner.username}`
        const ownerFriend = await User.getFriend(ownerID)
        // kiểm tra thành viên
        for(let i = 0 ; i < memberIDs.length; i++) {
            if(!ownerFriend.includes(memberIDs[i]) && ownerID !== memberIDs[i]) throw new UnknownFriendRelation()
        }
        // kiểm ra danh sách member có bao gôm owner ko nếu ko thêm vào
        if(!memberIDs.includes(ownerID)) memberIDs.push(ownerID)
        // tạo phòng
        const room = new RoomModel({
            name: name,
            isGroup: true,
            userIDs: [...memberIDs],
            ownerID : ownerID,
            settings: {
            },
            lastChange: new Date(),
        })
        await room.save()
                  .then(room => {
                      Room.updateLastChange(room)
                  })
    }
}
export {Room}
