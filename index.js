const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
    // console.log("Connected to MongoDB!");

    const db = client.db("Digital-Life-Lessons");
    const lessonsCollection = db.collection("lessons");
    const usersCollection = db.collection("user");

    app.post("/api/lessons", async (req, res) => {
      try {
        const lesson = {
          ...req.body,
          visibility: "Public",
          likes: [],
          likesCount: 0,
          isFeatured: false,
          isReviewed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await lessonsCollection.insertOne(lesson);
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    app.get("/api/lessons", async (req, res) => {
      try {
        const lessons = await lessonsCollection
          .find({ visibility: "Public" })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(lessons);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    app.get("/api/lessons/my/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const lessons = await lessonsCollection
          .find({ creatorEmail: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(lessons);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    app.delete("/api/lessons/:id", async (req, res) => {
      try {
        const result = await lessonsCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    app.patch("/api/lessons/:id/visibility", async (req, res) => {
      try {
        const { visibility } = req.body; // ফ্রন্টএন্ড থেকে শুধু visibility নিচ্ছি
        const result = await lessonsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { visibility, updatedAt: new Date() } },
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });
    app.get("/api/lessons/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await lessonsCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Lesson not found" });
        }
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    app.put("/api/lessons/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedLesson = req.body;

        const updateDoc = {
          $set: {
            title: updatedLesson.title,
            description: updatedLesson.description,
            category: updatedLesson.category,
            emotionalTone: updatedLesson.emotionalTone,
            accessLevel: updatedLesson.accessLevel,
            updatedAt: new Date(),
          },
        };

        const result = await lessonsCollection.updateOne(filter, updateDoc);

        // যদি ডাটাবেসে ডকুমেন্টটি পাওয়া যায় (এমনকি যদি আপনি কোনো কিছু পরিবর্তন না করে হুবহু একই রেখে সেভ করেন, তাও matchedCount ১ হবে)
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    app.post("/api/comments", async (req, res) => {
      try {
        const comment = {
          lessonId: req.body.lessonId,
          userId: req.body.userId,
          userName: req.body.userName,
          userImage: req.body.userImage,
          text: req.body.text,
          createdAt: new Date(), // কমেন্ট করার সময় ট্র্যাক করার জন্য
        };

        const result = await db.collection("comments").insertOne(comment);
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    app.get("/api/comments/:lessonId", async (req, res) => {
      try {
        const id = req.params.lessonId;

        // শুধু ওই নির্দিষ্ট lessonId এর কমেন্টগুলো ফিল্টার করবে
        // .sort({ createdAt: -1 }) দেওয়ার কারণে একদম নতুন কমেন্টগুলো সবার উপরে দেখাবে
        const result = await db
          .collection("comments")
          .find({ lessonId: id })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });
    app.post("/api/lessons/:id/like", async (req, res) => {
      try {
        const lessonId = req.params.id;
        const { userId } = req.body;

        if (!userId) {
          return res.status(400).send({ message: "User ID is required" });
        }

        // প্রথমে চেক করব ইউজার কি অলরেডি লাইক দিয়ে রেখেছে?
        const lesson = await db
          .collection("lessons")
          .findOne({ _id: new ObjectId(lessonId) });

        if (!lesson) {
          return res.status(404).send({ message: "Lesson not found" });
        }

        const hasLiked = lesson.likes?.includes(userId);
        let updateDoc;

        if (hasLiked) {
          // অলরেডি লাইক থাকলে: অ্যারে থেকে আইডি সরাবো এবং কাউন্ট ১ কমাবো
          updateDoc = {
            $pull: { likes: userId },
            $inc: { likesCount: -1 },
          };
        } else {
          // লাইক না থাকলে: অ্যারেতে আইডি যোগ করব এবং কাউন্ট ১ বাড়াবো
          updateDoc = {
            $addToSet: { likes: userId },
            $inc: { likesCount: 1 },
          };
        }

        const result = await db
          .collection("lessons")
          .updateOne({ _id: new ObjectId(lessonId) }, updateDoc);

        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

   
    app.get("/api/lessons/favorites/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        // 'favorites' অ্যারেইর মধ্যে এই userId-টি আছে এমন সব লেসন খুঁজে বের করবে
        const result = await db
          .collection("lessons")
          .find({ favorites: userId })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    app.get("/api/user/dashboard-summary", async (req, res) => {
      try {
        const { email, userId } = req.query; // ফ্রন্টএন্ড থেকে email এবং userId দুটোই নিলাম

        if (!email) {
          return res
            .status(400)
            .json({ message: "email is required in query parameters" });
        }

        // ১. আপনার 'My Lessons' রাউটের মতো এখানেও creatorEmail দিয়ে কাউন্ট করা হলো
        const totalLessons = await lessonsCollection.countDocuments({
          creatorEmail: email,
        });

        // ২. ফেভারিট কাউন্ট (ইউজার আইডি দিয়েই ট্র্যাক হবে)
        const favorites = await lessonsCollection.countDocuments({
          favorites: userId,
        });

        // ৩. রিসেন্ট ৩টি লেসনও creatorEmail দিয়ে আনা হলো
        const recentLessons = await lessonsCollection
          .find({ creatorEmail: email })
          .sort({ createdAt: -1 })
          .limit(3)
          .toArray();

        res.status(200).json({
          totalLessons,
          favorites,
          recentLessons,
        });
      } catch (error) {
        console.error("Dashboard Endpoint Error:", error);
        res
          .status(500)
          .json({ message: "Internal Server Error", error: error.message });
      }
    });
    app.post("/create-checkout-session", async (req, res) => {
      const { userId, userEmail } = req.body; // ফ্রন্টএন্ড থেকে পাঠানো ইউজার ইমেইল

      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],

          // 💡 এই লাইনটি যোগ করুন: ফ্রন্টএন্ড থেকে আসা ইউজারের আসল ইমেইলটি এখানে পাস করুন
          customer_email: userEmail,

          line_items: [
            {
              price_data: {
                currency: "bdt",
                product_data: {
                  name: "Digital Life Lessons - Lifetime Premium ⭐",
                  description:
                    "আজীবন প্রিমিয়াম মেম্বারশিপ এবং সকল কন্টেন্টের ফুল অ্যাক্সেস।",
                },
                unit_amount: 150000, // ৳১৫০০
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          metadata: {
            userId: userId,
            userEmail: userEmail,
          },
          success_url:
            "http://localhost:3000/payment-success?session_id={CHECKOUT_SESSION_ID}",
          cancel_url: "http://localhost:3000/pricing",
        });

        res.json({ url: session.url });
      } catch (error) {
        console.error("Stripe error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/api/verify-payment", async (req, res) => {
      const { session_id } = req.query;

      try {
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === "paid") {
          const { userId, userEmail } = session.metadata;

          // ১. কি আসছে দেখো
          console.log("=== VERIFY PAYMENT DEBUG ===");
          console.log("userId:", userId);
          console.log("userEmail:", userEmail);

          // ২. আদৌ ইউজার পাচ্ছো কিনা দেখো
          const foundUser = await usersCollection.findOne({ email: userEmail });
          console.log("Found user:", foundUser);

          // ৩. আপডেট করো
          const updateResult = await usersCollection.updateOne(
            { email: userEmail },
            { $set: { isPremium: true, premiumSince: new Date() } },
          );
          console.log("matchedCount:", updateResult.matchedCount);
          console.log("modifiedCount:", updateResult.modifiedCount);

          res.json({ success: true, email: session.customer_email });
        } else {
          res.json({ success: false });
        }
      } catch (err) {
        console.error("Error:", err.message);
        res.status(500).json({ error: err.message });
      }
    });
    app.get("/api/admin/stats", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const totalLessons = await lessonsCollection.countDocuments({
          visibility: "Public",
        });
        const reportedLessons = await lessonsCollection.countDocuments({
          isReported: true,
        });

        // আজকের lessons
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayLessonsCount = await lessonsCollection.countDocuments({
          createdAt: { $gte: todayStart },
        });

        // আজকের lesson titles
        const todayLessonsList = await lessonsCollection
          .find({ createdAt: { $gte: todayStart } })
          .project({ title: 1 })
          .limit(5)
          .toArray();

        // Most active contributors
        const contributors = await lessonsCollection
          .aggregate([
            {
              $group: {
                _id: "$creatorEmail",
                lessons: { $sum: 1 },
                name: { $first: "$creatorName" },
                image: { $first: "$creatorImage" },
              },
            },
            { $sort: { lessons: -1 } },
            { $limit: 3 },
          ])
          .toArray();

        // Monthly lesson growth (last 6 months)
        const lessonGrowth = await lessonsCollection
          .aggregate([
            {
              $group: {
                _id: { $month: "$createdAt" },
                lessons: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            { $limit: 6 },
          ])
          .toArray();

        // Monthly user growth
        const userGrowth = await usersCollection
          .aggregate([
            {
              $group: {
                _id: { $month: "$createdAt" },
                users: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            { $limit: 6 },
          ])
          .toArray();

        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];

        res.json({
          totalUsers,
          totalLessons,
          reportedLessons,
          todayLessonsCount,
          todayLessonsList: todayLessonsList.map((l) => l.title),
          contributors,
          lessonData: lessonGrowth.map((d) => ({
            month: months[d._id - 1],
            lessons: d.lessons,
          })),
          userData: userGrowth.map((d) => ({
            month: months[d._id - 1],
            users: d.users,
          })),
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
    // সব lessons আনো (admin এর জন্য)
app.get("/api/admin/lessons", async (req, res) => {
  try {
    const lessons = await lessonsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Featured toggle
app.patch("/api/admin/lessons/:id/featured", async (req, res) => {
  try {
    const lesson = await lessonsCollection.findOne({ _id: new ObjectId(req.params.id) });
    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { isFeatured: !lesson.isFeatured } }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reviewed toggle
app.patch("/api/admin/lessons/:id/reviewed", async (req, res) => {
  try {
    const lesson = await lessonsCollection.findOne({ _id: new ObjectId(req.params.id) });
    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { isReviewed: !lesson.isReviewed } }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete lesson
app.delete("/api/admin/lessons/:id", async (req, res) => {
  try {
    const result = await lessonsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// সব users আনো
app.get("/api/admin/users", async (req, res) => {
  try {
    const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Make Admin toggle
app.patch("/api/admin/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role } }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user
app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    const result = await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reported lessons আনো (isReported: true)
app.get("/api/admin/reported-lessons", async (req, res) => {
  try {
    const lessons = await lessonsCollection
      .find({ isReported: true })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ignore — isReported false করো
app.patch("/api/admin/lessons/:id/ignore", async (req, res) => {
  try {
    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { isReported: false, reports: [] } }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


  } catch (err) {
    console.log(err);
  }
}
run();

app.get("/", (req, res) => {
  res.send("Server is running...");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports=app