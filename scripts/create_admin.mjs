import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function ensureAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('YatraiPass@123', salt);

  const filter = { email: 'admin.yatrai@example.com' };
  const update = {
    $set: {
      name: 'Yatrai Admin',
      email: 'admin.yatrai@example.com',
      passwordHash: passwordHash,
      role: 'admin',
      status: 'active',
      preferences: {
        preferredTransportModes: ['rail', 'flight', 'bus'],
        preferredCurrency: 'INR',
        preferredLanguage: 'en',
      },
      updatedAt: new Date(),
    },
    $setOnInsert: {
      createdAt: new Date(),
    },
  };

  const result = await mongoose.connection.collection('users').updateOne(filter, update, { upsert: true });
  console.log('Admin user upsert result:', result);

  // Test login via HTTP endpoint
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin.yatrai@example.com',
      password: 'YatraiPass@123',
    }),
  });

  const loginData = await loginRes.json();
  console.log('HTTP login test status:', loginRes.status);
  console.log('HTTP login response:', JSON.stringify(loginData, null, 2));

  await mongoose.disconnect();
}

ensureAdmin().catch(console.error);
