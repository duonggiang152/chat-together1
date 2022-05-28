import { Schema, model } from 'mongoose';
import { IMessage } from '../types/message.type';
const MessageSchema = new Schema<IMessage>({
    msg: String,
    sender: String,
    roomID: String,
    createdAt: Date,
    modifiedAt: Date,
}, { timestamps: true });

const MessageModel = model('messages', MessageSchema);

class Message {
    static async getMessage(messageID: string) {
        const message = await MessageModel.findOne({_id: messageID})
        if(!message) throw new Error("tin Không tồn tại")
        return message
    }
    static async sendMessage(roomID: String, message: Object, userSendID: String) {
        
    }
}

export default MessageModel;
export {Message}