import mongoose from "mongoose";
import slugify from "slugify";

const WorkspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Workspace name is required"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    ownerId: {
      type: String,
      required: [true, "Owner ID is required"],
      index: true,
      validate: {
        validator: function (v) {
          return (
            /^[a-f\d]{24}$/i.test(v) ||
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              v
            )
          );
        },
        message: (props) => `${props.value} is not a valid User ID format!`,
      },
    },
    description: {
      type: String,
      maxlength: 200,
      default: "",
    },
    // Soft delete flag (optional)
    isDeleted: {
      type: Boolean,
      default: false,
    },
    logo: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Auto-generate slug before saving
WorkspaceSchema.pre("save", function (next) {
  if (!this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

export const Workspace = mongoose.model("Workspace", WorkspaceSchema);
