const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const data = require('./data');
const Listing = require('../models/listing');
const User = require('../models/user');
const { dbUrl } = require('../config/env');

main()
.then(() => console.log('Database connected'))
.catch(err => console.log(err));

async function main() {
  await mongoose.connect(dbUrl);
  console.log("Database connected");
  const password = await bcrypt.hash(process.env.SEED_PASSWORD || 'wanderlust-seed-password', 12);
  const seedUser = await User.findOneAndUpdate(
    { email: 'seed@wanderlust.local' },
    {
      username: 'wanderlust-seed',
      email: 'seed@wanderlust.local',
      password
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await Listing.deleteMany({});
  await Listing.insertMany(
    data.data.map((listing) => ({ ...listing, owner: seedUser._id }))
  );
}

