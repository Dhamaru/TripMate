import mongoose, { Schema } from "mongoose";

// Feedback screenshots. They used to be written to the server's disk, which
// Render wipes on every deploy and idle spin-down, so most were gone before
// anyone triaged the report.
interface IFeedbackAttachment {
  contentType: string;
  data: Buffer;
  createdAt: Date;
}

const feedbackAttachmentSchema = new Schema<IFeedbackAttachment>(
  {
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
    // Kept 180 days, long past any triage.
    createdAt: { type: Date, default: Date.now, expires: 180 * 24 * 60 * 60 },
  },
  { versionKey: false },
);

export const FeedbackAttachmentModel = mongoose.model<IFeedbackAttachment>(
  "FeedbackAttachment",
  feedbackAttachmentSchema,
);
