/super-admin
db.users.insertOne({
  name: "Super Admin",
  email: "<email>",
  phone: "<phone number>",
   createdAt: new Date(),
   updatedAt: new Date()
  __v: 1,
  role: ObjectId("<role_id_here>"),
  employeeId: "KLARITY1234D",
  gender: "male",
  joinDate: new Date(),,
  profile: {
     createdAt: new Date(),
    address: "",
    isFirstLogin: true,
    isTimezoneSet: false
  },
  notificationPreferences: {},
  preferredTimeSlots: [],
  students: [],
  subjects: [],
  teacherId: []
});

db.roles.insertOne({ 
  userId: ObjectId("6855417337e6ddd2974925a9"),
  roleName: "Super Admin"
});

db.users.updateOne(
  { _id: ObjectId("6855417337e6ddd2974925a9") },
  { $set: { role: ObjectId("6855420437e6ddd2974925aa") } }
);

db.users.insertOne({
  name: "Super Admin",
  email: "<email>",
  phone: "<phone number>",
   createdAt: new Date(),
   updatedAt: new Date()
  __v: 1,
  role: ObjectId("<role_id_here>"),
  employeeId: "KLARITY1234D",
  gender: "male",
  joinDate: new Date(),,
  profile: {
     createdAt: new Date(),
    address: "",
    isFirstLogin: true,
    isTimezoneSet: false
  },
  notificationPreferences: {},
  preferredTimeSlots: [],
  students: [],
  subjects: [],
  teacherId: []
});

db.roles.insertOne({ 
  userId: ObjectId("6855417337e6ddd2974925a9"),
  roleName: "Super Admin"
});

db.users.updateOne(
  { _id: ObjectId("6855417337e6ddd2974925a9") },
  { $set: { role: ObjectId("6855420437e6ddd2974925aa") } }
);

db.admins.insertOne({
  userId: ObjectId("user_id_here"),
  role: "Super Admin",
  isSuperAdmin: true,
  createdAt: new Date(),
  updatedAt: new Date()
})


## Production:
https://frontendnew-470003429420.asia-south2.run.app
https://klaritilms-470003429420.asia-south2.run.app

## Development:
https://klaritilms-frontend.onrender.com
https://klaritilms-u5bp.onrender.com

## Testing:



