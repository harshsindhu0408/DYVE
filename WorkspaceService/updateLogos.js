import dotenv from "dotenv";
import mongoose from 'mongoose';
import { Workspace } from './models/workspace.model.js';
dotenv.config();

async function backfillWorkspaceLogos() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB...');

    // Add the static method to Workspace model
    Workspace.addMissingLogos = async function() {
      try {
        // Find all workspaces without a logo URL or with empty logo object
        const workspaces = await this.find({
          $or: [
            { 'logo.url': { $exists: false } },
            { 'logo.url': null },
            { 'logo': { $exists: false } },
            { 'logo': null }
          ]
        });

        if (workspaces.length === 0) {
          console.log('All workspaces already have logos');
          return { modifiedCount: 0 };
        }

        console.log(`Found ${workspaces.length} workspaces without logos`);

        const bulkOps = workspaces.map(workspace => ({
          updateOne: {
            filter: { _id: workspace._id },
            update: {
              $set: {
                logo: {
                  url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(workspace.name)}`,
                  path: 'auto-generated'
                }
              }
            }
          }
        }));

        // Execute bulk operation
        const result = await this.bulkWrite(bulkOps);
        console.log(`Updated ${result.modifiedCount} workspaces with auto-generated logos`);
        return result;
      } catch (error) {
        console.error('Error adding missing logos:', error);
        throw error;
      }
    };

    // Run the backfill
    const result = await Workspace.addMissingLogos();
    console.log('Migration completed:', result);

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

backfillWorkspaceLogos();