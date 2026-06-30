// @ts-nocheck
import mongoose from 'mongoose';
import { User } from './models';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/typeclash';

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const users = await User.find();
  let updatedCount = 0;

  for (const user of users) {
    let newUsername = user.username;
    
    // Replace non-alphanumeric/underscore with underscore
    newUsername = newUsername.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Pad to 3 chars if too short
    if (newUsername.length < 3) {
      newUsername = newUsername.padEnd(3, '_');
    }
    
    // Truncate to 20 chars if too long
    if (newUsername.length > 20) {
      newUsername = newUsername.substring(0, 20);
    }
    
    // Ensure uniqueness, if necessary append a random string
    if (newUsername !== user.username) {
      let isUnique = false;
      let suffix = '';
      while (!isUnique) {
        const candidate = newUsername + suffix;
        const existing = await User.findOne({ username: candidate });
        if (!existing || existing._id.equals(user._id)) {
          newUsername = candidate;
          isUnique = true;
        } else {
          suffix = Math.floor(Math.random() * 1000).toString();
        }
      }
      console.log(`Migrating username: "${user.username}" -> "${newUsername}"`);
      user.username = newUsername;
      await user.save();
      updatedCount++;
    }
  }

  console.log(`Migration complete. Updated ${updatedCount} users.`);
  process.exit(0);
}

migrate().catch(console.error);
