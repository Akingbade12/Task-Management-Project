import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
dotenv.config();

const { DB_NAME, DB_URI } = process.env;

const typeDefs = `

type Query {
 myTaskLists : [TaskList!]!
}

type Mutation {
 signup(input: SignUpInput): AuthUser!
 signin(input: SignInInput): AuthUser!
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
    myTaskLists: () => [],
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
        token: "token",
      };
    },
    signin: async(_, {input}, {db}) => {
      const user = await db.collection('users').findOne({email: input.email})
      if(!user) {
        throw new Error('User not found')
      }
      // check if password is correct
      const isPasswordCorrect = bcrypt.compareSync(input.password, user.password)
      if(!isPasswordCorrect) {
        throw new Error('User not found')
      }
      return {
        user,
        token: "token"
      }
    },
  },
  User: {
    // id: (root) => {
    //   return root._id || root.id
    // },
    id: ({_id, id}) => id || _id
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
    context: async () => ({
      db,
    }),
  });

  console.log(`🚀  Server ready at: ${url}`);
};

start();
