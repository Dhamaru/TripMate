import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    googleId?: string;
    preferences?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const userSchema = new Schema<IUser>(
    {
        email: { type: String, unique: true, sparse: true },
        password: { type: String },
        firstName: { type: String },
        lastName: { type: String },
        avatar: { type: String },
        googleId: { type: String, sparse: true },
        preferences: { type: Schema.Types.Mixed, default: {} },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_, ret: any) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.password;
                delete ret.__v;
                return ret;
            },
        },
    }
);

export const UserModel = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
export default UserModel;
