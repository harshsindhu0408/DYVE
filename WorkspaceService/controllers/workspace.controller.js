import { Workspace } from "../models/workspace.model.js";
import mongoose from "mongoose";
import { WorkspaceMember } from "../models/workspaceMember.model.js";
import { eventBus } from "../services/rabbit.js";
import fs from "fs";
import {
  sendErrorResponse,
  sendSuccessResponse,
} from "../Utils/responseUtils.js";
import { requestUserData } from "../services/userAccess.js";

const validateOwnership = async (workspaceId, userId) => {
  const workspace = await Workspace.findOne({
    _id: workspaceId,
    ownerId: userId,
    isDeleted: false,
  });
  return !!workspace;
};

// tested
export const createWorkspace = async (req, res) => {
  try {
    const { name, description } = req.body;
    const ownerId = req.user._id;

    if (!name || !name.trim()) {
      return sendErrorResponse(
        res,
        400,
        "MISSING_REQUIRED_FIELDS",
        "Workspace name is required"
      );
    }

    const workspaceData = {
      name: name.trim(),
      description: description ? description.trim() : null,
      ownerId,
    };

    if (req.file) {
      workspaceData.logo = {
        path: req.file.path, // Full server path to the file
        url: `/uploads/workspaces/logos/${req.file.filename}`, // Public accessible URL
      };
    }

    const newWorkspace = await Workspace.create(workspaceData);

    await WorkspaceMember.create({
      userId: ownerId,
      workspaceId: newWorkspace._id,
      role: "owner",
      status: "active",
      userDisplay: {
        name: req.user.profile.name,
        avatar: req.user.profile.avatar,
        status: "active",
      },
      invitedBy: ownerId,
      email: req.user.email,
    });


    await eventBus.publish("workspace_events", "workspace.created", {
      workspaceId: newWorkspace._id,
      ownerId,
      workspaceName: newWorkspace.name,
      hasLogo: !!req.file,
      defaultChannel: {
        name: "general",
        description: "General discussion channel",
        isPublic: true,
        createdBy: ownerId,
      },
      userData: { 
        profile: {
          name: req.user.profile.name,
          avatar: req.user.profile.avatar,
          bio: req.user.profile.bio,
        },
        status: req.user.status,
        email: req.user.email,
      },
    });

    return sendSuccessResponse(
      res,
      201,
      "WORKSPACE_CREATED",
      "Workspace created successfully",
      {
        workspace: {
          id: newWorkspace._id,
          name: newWorkspace.name,
          slug: newWorkspace.slug,
          logo: newWorkspace.logo?.url || null,
        },
      }
    );
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error cleaning up uploaded file:", err);
      });
    }

    if (error.code === 11000) {
      return sendErrorResponse(
        res,
        400,
        "DUPLICATE_SLUG",
        "Workspace with similar name already exists"
      );
    }

    if (error.name === "ValidationError") {
      return sendErrorResponse(
        res,
        400,
        "VALIDATION_ERROR",
        "Validation failed",
        error.message
      );
    }

    if (
      error.message.includes("File size too large") ||
      error.message.includes("Invalid file type")
    ) {
      return sendErrorResponse(res, 400, "INVALID_FILE", error.message);
    }

    return sendErrorResponse(
      res,
      500,
      "WORKSPACE_CREATION_FAILED",
      "Failed to create workspace",
      error.message
    );
  }
};

// tested
export const getWorkspace = async (req, res) => {
  try {
    const { slug } = req.params;

    const workspace = await Workspace.findOne({
      slug,
      isDeleted: false,
    }).lean();

    if (!workspace) {
      return sendErrorResponse(
        res,
        404,
        "WORKSPACE_NOT_FOUND",
        "Workspace not found"
      );
    }

    // Check if user has access
    const isMember = await WorkspaceMember.exists({
      workspaceId: workspace._id,
      userId: req.user._id,
      status: "active",
    });

    if (!isMember && workspace.ownerId !== req.user._id) {
      return sendErrorResponse(
        res,
        403,
        "ACCESS_DENIED",
        "You don't have access to this workspace"
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "WORKSPACE_FETCHED",
      "Workspace fetched successfully",
      { workspace }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "FETCH_WORKSPACE_FAILED",
      "Failed to fetch workspace",
      error.message
    );
  }
};

// tested
export const updateWorkspace = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { slug } = req.params;
    const { name, description } = req.body;
    const userId = req.user._id;

    if (name.length > 50) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "NAME_TOO_LONG",
        "You can only choose workspace name with 50 characters"
      );
    }

    // Find workspace
    const workspace = await Workspace.findOne({ slug }).session(session);
    if (!workspace) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        404,
        "WORKSPACE_NOT_FOUND",
        "Workspace not found"
      );
    }

    // Verify ownership
    if (workspace.ownerId !== userId) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "PERMISSION_DENIED",
        "Only workspace owner can update"
      );
    }

    // Prepare updates
    const updates = {};
    if (name && name.trim() !== workspace.name) {
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description.trim();
    }

    // Apply updates
    const updatedWorkspace = await Workspace.findOneAndUpdate(
      { _id: workspace._id },
      updates,
      { new: true, session }
    );

    await session.commitTransaction();

    // Emit update event
    await eventBus.publish("workspace_events", "workspace.updated", {
      workspaceId: workspace._id,
      updatedFields: Object.keys(updates),
    });

    return sendSuccessResponse(
      res,
      200,
      "WORKSPACE_UPDATED",
      "Workspace updated successfully",
      { workspace: updatedWorkspace }
    );
  } catch (error) {
    await session.abortTransaction();

    // Clean up uploaded file if error occurred
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error cleaning up file:", err);
      });
    }

    if (error.code === 11000) {
      return sendErrorResponse(
        res,
        409,
        "DUPLICATE_SLUG",
        "Workspace with this name already exists"
      );
    }

    return sendErrorResponse(
      res,
      500,
      "WORKSPACE_UPDATE_FAILED",
      "Failed to update workspace",
      error.message
    );
  } finally {
    session.endSession();
  }
};

// tested
export const deleteWorkspace = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { slug } = req.params;
    const userId = req.user._id;

    // Find workspace
    const workspace = await Workspace.findOne({ slug }).session(session);
    if (!workspace) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        404,
        "WORKSPACE_NOT_FOUND",
        "Workspace not found"
      );
    }

    // Verify ownership
    if (workspace.ownerId !== userId) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "PERMISSION_DENIED",
        "Only workspace owner can delete"
      );
    }

    // Delete logo file if exists
    if (workspace.logo?.path) {
      try {
        if (fs.existsSync(workspace.logo.path)) {
          fs.unlinkSync(workspace.logo.path);
        }
      } catch (fileError) {
        console.error("Error deleting workspace logo:", fileError);
        // Continue with deletion even if logo deletion fails
      }
    }

    // Soft delete
    workspace.isDeleted = true;
    workspace.logo = undefined; // Remove logo reference
    await workspace.save({ session });

    await session.commitTransaction();

    // Emit delete event
    await eventBus.publish("workspace_events", "workspace.deleted", {
      workspaceId: workspace._id,
      deletedBy: userId,
    });

    return sendSuccessResponse(
      res,
      200,
      "WORKSPACE_DELETED",
      "Workspace deleted successfully"
    );
  } catch (error) {
    await session.abortTransaction();
    return sendErrorResponse(
      res,
      500,
      "WORKSPACE_DELETION_FAILED",
      "Failed to delete workspace",
      error.message
    );
  } finally {
    session.endSession();
  }
};

// tested
export const listWorkspaces = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const userId = req.user._id;

    // Build query
    const query = {
      isDeleted: false,
      $or: [
        { ownerId: userId },
        {
          _id: {
            $in: await WorkspaceMember.distinct("workspaceId", { userId }),
          },
        },
      ],
    };

    if (search) {
      query.$or.push(
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      );
    }

    const workspaces = await Workspace.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Workspace.countDocuments(query);

    return sendSuccessResponse(
      res,
      200,
      "WORKSPACES_FETCHED",
      "Workspaces fetched successfully",
      {
        workspaces,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "FETCH_WORKSPACES_FAILED",
      "Failed to fetch workspaces",
      error.message
    );
  }
};

// tested
export const updateWorkspaceLogo = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { slug } = req.params;
    const userId = req.user._id;

    // Check if file is uploaded
    if (!req.file) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        400,
        "NO_FILE_UPLOADED",
        "No file uploaded"
      );
    }

    // Validate file type
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      if (fs.existsSync(req.file.path)) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error("Error deleting invalid file:", err);
        });
      }

      await session.abortTransaction();
      return sendErrorResponse(
        res,
        400,
        "INVALID_FILE_TYPE",
        "Only JPEG, PNG, and WEBP files are allowed"
      );
    }

    // Find workspace
    const workspace = await Workspace.findOne({ slug }).session(session);
    if (!workspace) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        404,
        "WORKSPACE_NOT_FOUND",
        "Workspace not found"
      );
    }

    // Verify ownership
    if (workspace.ownerId.toString() !== userId.toString()) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "PERMISSION_DENIED",
        "Only workspace owner can update logo"
      );
    }

    // Delete old logo if exists
    const oldLogoPath = workspace.logo?.path || null;

    // Update logo
    workspace.logo = {
      path: req.file.path,
      url: `/uploads/workspaces/logos/${req.file.filename}`,
    };
    await workspace.save({ session });

    await session.commitTransaction();

    // Clean up old logo file
    if (oldLogoPath && fs.existsSync(oldLogoPath)) {
      fs.unlink(oldLogoPath, (err) => {
        if (err) console.error("Error deleting old logo:", err);
      });
    }

    return sendSuccessResponse(
      res,
      200,
      "LOGO_UPDATED",
      "Workspace logo updated successfully",
      { logoUrl: workspace.logo.url }
    );
  } catch (error) {
    await session.abortTransaction();

    // Clean up uploaded file if error occurred
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error cleaning up file:", err);
      });
    }

    return sendErrorResponse(
      res,
      500,
      "LOGO_UPDATE_FAILED",
      "Failed to update workspace logo",
      error.message
    );
  } finally {
    session.endSession();
  }
};
