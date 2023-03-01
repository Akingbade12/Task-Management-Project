import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";


dotenv.config();

const { DB_NAME, DB_URI, JWT_SECRET } = process.env;

const getToken = (user) =>
  jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "30 days" });
const getUserFromToken = async (token, db) => {
  if (!token) return null;
  const decoded = jwt.verify(token, JWT_SECRET);
  if (!decoded?.id) {
    return null;
  }
  return await db
    .collection("users")
    .findOne({ _id: new ObjectId(decoded.id) });
};
const typeDefs = `

type Query {
 myTaskLists : [TaskList!]!
getTaskList(id: ID!): TaskList
}

type Mutation {
 signup(input: SignUpInput): AuthUser!
 signin(input: SignInInput): AuthUser!

 createTaskList(title: String!): TaskList!
 updateTaskList(id: ID!, title: String!): TaskList!
 deleteTaskList(id: ID!): Boolean!
 addUserToTaskList(taskListId: ID!, userId: ID!): TaskList

  createToDo(content: String!, taskListId: ID!): ToDo!
  updateToDo(id:ID!, content:String, isCompleted: Boolean!): ToDo!
  deleteToDo (id:ID!): Boolean!
}

input SignUpInput {
 email: String!
 password:String!
 name: String!
 avatar:String
}

input SignInInput {
 email: String!
 password:String!
}

type AuthUser {
 user: User!
 token: String!
}

type User {
  id: ID!
  name: String!
  email: String!
  avatar: String
}

type TaskList {
  id: ID!
  createdAt: String!
  title: String!
  progress: Float!

  users: [User!]!
  todos: [ToDo!]!
}


type ToDo {
 id: ID!
 content: String!
 isCompleted: Boolean!

 taskList: TaskList!
}
`;

// Resolvers define how to fetch the types defined in your schema using queries
const resolvers = {
  Query: {
    myTaskLists: (_, __, { db, user }) => {
      if (!user) {
        throw new Error("Authentication error. Please Sign In");
      }
      return db
        .collection("taskLists")
        .find({ userIDs: { $in: [user._id] } })
        .toArray();
    },
    getTaskList: async (_, { id }, { user, db }) => {
      if (!user) {
        throw new Error("Authentication error. Please Sign In");
      }
      return await db
        .collection("taskLists")
        .findOne({ _id: new ObjectId(id) });
    },
  },
  Mutation: {
    signup: async (_, { input }, { db }) => {
      const hashedPassword = bcrypt.hashSync(input.password);
      const user = {
        ...input,
        password: hashedPassword,
      };
      // save to database and insert user to database
      const result = await db.collection("users").insertOne(user);
      // console.log(result);
      return {
        user: {
          ...user,
        },
        token: getToken(user),
      };
    },
    signin: async (_, { input }, { db }) => {
      const user = await db.collection("users").findOne({ email: input.email });
      if (!user) {
        throw new Error("User not found");
      }
      // check if password is correct
      const isPasswordCorrect = bcrypt.compareSync(
        input.password,
        user.password
      );
      if (!isPasswordCorrect) {
        throw new Error("User not found");
      }
      return {
        user,
        token: getToken(user),
      };
    },
    createTaskList: async (_, { title }, { user, db }) => {
      if (!user) {
        throw new Error("Authentication error. Please Sign In");
      }
      const newTaskList = {
        title,
        createdAt: new Date().toISOString(),
        userIDs: [user._id],
      };
      const result = await db.collection("taskLists").insertOne(newTaskList);
      return {
        ...newTaskList,
      };
    },
    updateTaskList: async (_, { id, title }, { user, db }) => {
      if (!user) {
        throw new Error("Authentication error. Please Sign In");
      }
      const taskList = await db
        .collection("taskLists")
        .findOne({ _id: new ObjectId(id) });
      if (!taskList) {
        throw new Error("TaskList not found");
      }
      const result = await db
        .collection("taskLists")
        .updateOne({ _id: new ObjectId(id) }, { $set: { title } });
      return await db
        .collection("taskLists")
        .findOne({ _id: new ObjectId(id) });
    },
    deleteTaskList: async (_, { id }, { user, db }) => {
      if (!user) {
        throw new Error("Authentication error. Please Sign In");
      }
      const taskList = await db
        .collection("taskLists")
        .findOne({ _id: new ObjectId(id) });
      if (!taskList) {
        throw new Error("TaskList not found");
      }
      const result = await db
        .collection("taskLists")
        .deleteOne({ _id: new ObjectId(id) });
      return true;
    },
    addUserToTaskList: async (_, { taskListId, userId }, { db, user }) => {
      if (!user) {
        throw new Error("Authentication Error. Please sign in");
      }
      const taskList = await db
        .collection("taskLists")
        .findOne({ _id: new ObjectId(taskListId) });
      if (!taskList) {
        throw new Error("TaskList not found");
      }
      if (
        taskList.userIDs.find((dbId) => dbId.toString() === userId.toString())
      ) {
        return taskList;
      }
      await db.collection("taskLists").updateOne(
        {
          _id: new ObjectId(taskListId),
        },
        {
          $push: {
            userIDs: new ObjectId(userId),
          },
        }
      );
      taskList.userIDs.push(new ObjectId(userId));
      return taskList;
    },
    createToDo: async (_, { content, taskListId }, { db, user }) => {
      if (!user) {
        throw new Error("Authentication Error. Please sign in");
      }
      const newToDo = {
        content,
        taskListId: new ObjectId(taskListId),
        isCompleted: false,
      };
      const result = await db.collection("todos").insertOne(newToDo);
      return {
        ...newToDo,
      };
    },
    updateToDo: async (_, data, { db, user }) => {
      if (!user) {
        throw new Error("Authentication Error. Please sign in");
      }
      const result = await db
        .collection("todos")
        .updateOne({ _id: new ObjectId(data.id) }, { $set: data });
      return await db
        .collection("todos")
        .findOne({ _id: new ObjectId(data.id) });
    },
    deleteToDo: async (_, { id }, { db, user }) => {
      if (!user) {
        throw new Error("Authentication Error. Please sign in");
      }
      const result = await db
        .collection("todos")
        .deleteOne({ _id: new ObjectId(id) });
      return true;
    },
  },
  User: {
    // id: (root) => {
    //   return root._id || root.id
    // },
    id: ({ _id, id }) => id || _id,
  },
  TaskList: {
    id: ({ _id, id }) => id || _id,
    progress: async ({ _id }, _, { db }) => {
      const todos = await db
        .collection("todos")
        .find({
          taskListId: new ObjectId(_id),
        })
        .toArray();
      const completedTodos = todos.filter((todo) => todo.isCompleted);
      if (todos.length === 0) {
        return 0;
      }
      return Math.round((completedTodos.length / todos.length) * 100);
    },
    users: async ({ userIDs }, _, { db }) => {
      return await db
        .collection("users")
        .find({ _id: { $in: userIDs } })
        .toArray();
    },
    todos: async ({ _id }, _, { db }) =>
      await db.collection("todos").find({ taskListId: _id }).toArray(),
  },
  ToDo: {
    id: ({ _id, id }) => id || _id,
    taskList: async ({ taskListId }, _, { db }) =>
      await db
        .collection("taskLists")
        .findOne({ _id: new ObjectId(taskListId) }),
  },
};

const start = async () => {
  const client = new MongoClient(DB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
    },
  });
  await client.connect();
  const db = client.db(DB_NAME);

  const context = db;

  console.log(`Connected to database`);

  // The ApolloServer constructor requires two parameters: your schema
  // definition and your set of resolvers.
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  // Passing an ApolloServer instance to the `startStandaloneServer` function:
  //  1. creates an Express app
  //  2. installs your ApolloServer instance as middleware
  //  3. prepares your app to handle incoming requests
  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },

    context: async ({ req }) => {
      const user = await getUserFromToken(req.headers.authorization, db);
      return {
        user,
        db,
      };
    },
  });

  console.log(`🚀  Server ready at: ${url}`);
};

start();
