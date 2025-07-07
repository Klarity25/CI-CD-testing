const { expect } = require("chai");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const nock = require("nock");
const sinon = require("sinon");
const app = require("../server");
const { redisClient } = require("../config/redis");
const authRouter = require("../routes/auth");

describe("Auth API - Login and Verify OTP", () => {
  let mongoServer;
  let generateOTPStub;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    generateOTPStub = sinon.stub(authRouter, "generateOTP").returns("123456");
  });

  after(async () => {
    // Restore the stubbed function
    generateOTPStub.restore();
    await mongoose.disconnect();
    await mongoServer.stop();
    await redisClient.quit();
  });

  describe("POST /auth/login", () => {
    it("should initiate login and send OTP for an existing user", async () => {
      // Mock Twilio SMS API
      nock("https://api.twilio.com").post(/.*/).reply(200);

      const res = await request(app)
        .post("/auth/login")
        .set("Device-Id", "test-device")
        .send({ identifier: "s38009406@gmail.com" }); // Assumes this email exists in the database

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("message", "OTP sent for login");
      expect(res.body).to.have.property("userId");

      // Verify OTP was stored in Redis
      const storedOTP = await redisClient.get(`otp:login:s38009406@gmail.com`);
      expect(storedOTP).to.equal("123456"); // Matches stubbed OTP
    });

    it("should fail for an unregistered email", async () => {
      const res = await request(app)
        .post("/auth/login")
        .set("Device-Id", "test-device")
        .send({ identifier: "unregistered@example.com" });

      expect(res.status).to.equal(404);
      expect(res.body).to.have.property("errors");
      expect(res.body.errors[0].msg).to.equal("Email is not registered");
    });
  });

  describe("POST /auth/verify-login-otp", () => {
    it("should log in a user with a valid OTP", async () => {
      // Mock Twilio SMS API
      nock("https://api.twilio.com").post(/.*/).reply(200);

      // Initiate login to generate OTP and get userId
      const loginRes = await request(app)
        .post("/auth/login")
        .set("Device-Id", "test-device")
        .send({ identifier: "s38009406@gmail.com" }); // Assumes this email exists in the database

      expect(loginRes.status).to.equal(200);
      const userId = loginRes.body.userId;

      const res = await request(app)
        .post("/auth/verify-login-otp")
        .set("Device-Id", "test-device")
        .send({ userId, otp: "123456" }); // Use stubbed OTP

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("message", "Login successful");
      expect(res.body).to.have.property("token");
      expect(res.body).to.have.property("user");
      expect(res.body.user).to.have.property("email", "s38009406@gmail.com");
      expect(res.body.user).to.have.property("_id", userId);

      // Verify session token in Redis
      const sessionToken = await redisClient.get(
        `session:${userId}:test-device`
      );
      expect(sessionToken).to.equal(res.body.token);
    });

    it("should fail with an invalid OTP", async () => {
      // Mock Twilio SMS API
      nock("https://api.twilio.com").post(/.*/).reply(200);

      // Initiate login to generate OTP and get userId
      const loginRes = await request(app)
        .post("/auth/login")
        .set("Device-Id", "test-device")
        .send({ identifier: "s38009406@gmail.com" }); // Assumes this email exists in the database

      expect(loginRes.status).to.equal(200);
      const userId = loginRes.body.userId;

      const res = await request(app)
        .post("/auth/verify-login-otp")
        .set("Device-Id", "test-device")
        .send({ userId, otp: "999999" }); // Incorrect OTP

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property("message", "Invalid OTP");
    });
  });
});
