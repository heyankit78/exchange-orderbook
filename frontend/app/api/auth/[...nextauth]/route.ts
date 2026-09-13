import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const BACKEND_URL = "http://localhost:3000/api/v1";

async function refreshAccessToken(token: any) {
  try {
    console.log("🔄 Refreshing backend access token");

    const response = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshToken: token.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error("Refresh token failed");
    }

    const data = await response.json();

    return {
      ...token,

      accessToken: data.accessToken,

      // 15 minutes
      accessTokenExpires: Date.now() + 15 * 60 * 1000,

      error: undefined,
    };
  } catch (error) {
    console.error("❌ Failed refreshing access token:", error);

    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",

      credentials: {
        email: {
          label: "Email",
          type: "email",
        },

        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const response = await fetch(`${BACKEND_URL}/auth/login`, {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!response.ok) {
            return null;
          }

          const data = await response.json();

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.email,

            accessToken: data.accessToken,
            refreshToken: data.refreshToken,

            accessTokenExpires: Date.now() + 15 * 60 * 1000,
          };
        } catch (error) {
          console.error("Credentials login failed:", error);

          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // First login
      if (user) {
        return {
          ...token,

          userId: user.id,

          accessToken: (user as any).accessToken,

          refreshToken: (user as any).refreshToken,

          accessTokenExpires: (user as any).accessTokenExpires,
        };
      }

      // Access token still valid
      if (Date.now() < Number(token.accessTokenExpires)) {
        return token;
      }

      // Access token expired
      return refreshAccessToken(token);
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
      }

      session.accessToken = token.accessToken as string;

      (session as any).error = token.error;

      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",

    // NextAuth session can stay alive
    // independently of backend access token
    maxAge: 30 * 24 * 60 * 60,
  },
});

export { handler as GET, handler as POST };
