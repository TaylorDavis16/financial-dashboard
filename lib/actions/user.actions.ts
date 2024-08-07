"use server";

import { cookies } from "next/headers";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import {
  CountryCode,
  ProcessorTokenCreateRequest,
  ProcessorTokenCreateRequestProcessorEnum,
  Products,
} from "plaid";

import { plaidClient } from "@/lib/plaid";
import { revalidatePath } from "next/cache";
import { addFundingSource, createDwollaCustomer } from "./dwolla.actions";

import {
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
  signOut,
  signIn,
  signUp,
  confirmSignUp,
} from "aws-amplify/auth";

export const getUserInfo = async () => {
  try {
    const attributes = await fetchUserAttributes();
    return parseStringify(attributes);
  } catch (error) {
    console.log(error);
  }
};

export async function userSignIn({
  username,
  password,
}: {
  username: string;
  password: string;
}) {
  try {
    const { isSignedIn, nextStep } = await signIn({ username, password });
    console.log("isSignedIn", isSignedIn);
    console.log("nextStep", nextStep);
    if (isSignedIn) {
      return true;
    }
    return false;
  } catch (error) {
    console.log("error signing in", error);
  }
}

export async function userSignUp({ password, ...userData }: SignUpParams) {
  try {
    // await axios.post(
    //   "https://6iq3crebff.execute-api.us-east-2.amazonaws.com/signup/betacode",
    //   {
    //     email,
    //     betacode,
    //   }
    // );
    const { nextStep, userId, isSignUpComplete } = await signUp({
      username: userData.email,
      password,
    });
    console.log(
      "nextStep",
      nextStep,
      "userId",
      userId,
      "isSignUpComplete",
      isSignUpComplete
    );
    return isSignUpComplete;
  } catch (error) {
    console.log("error signing up", error);
  }
}

export async function handleConfirmSignUp({
  email,
  confirmationCode,
}: {
  email: string;
  confirmationCode: string;
}) {
  try {
    const { isSignUpComplete } = await confirmSignUp({
      username: email,
      confirmationCode: confirmationCode,
    });
    return isSignUpComplete;
  } catch (error) {
    console.log("error confirming sign up:", error);
  }
}

// export const signUp = async ({ password, ...userData }: SignUpParams) => {
//   const { email, firstName, lastName } = userData;

//   let newUserAccount;

//   try {
//     const { account, database } = await createAdminClient();

//     newUserAccount = await account.create(
//       ID.unique(),
//       email,
//       password,
//       `${firstName} ${lastName}`
//     );

//     if (!newUserAccount) throw new Error("Error creating user");

//     const dwollaCustomerUrl = await createDwollaCustomer({
//       ...userData,
//       type: "personal",
//     });

//     if (!dwollaCustomerUrl) throw new Error("Error creating Dwolla customer");

//     const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);

//     const newUser = await database.createDocument(
//       DATABASE_ID!,
//       USER_COLLECTION_ID!,
//       ID.unique(),
//       {
//         ...userData,
//         userId: newUserAccount.$id,
//         dwollaCustomerId,
//         dwollaCustomerUrl,
//       }
//     );

//     const session = await account.createEmailPasswordSession(email, password);

//     cookies().set("appwrite-session", session.secret, {
//       path: "/",
//       httpOnly: true,
//       sameSite: "strict",
//       secure: true,
//     });
//     console.log("newUser", newUser);
//     return parseStringify(newUser);
//   } catch (error) {
//     console.error("Error", error);
//   }
// };

export async function getLoggedInUser() {
  try {
    const user = await getCurrentUser();

    return parseStringify(user);
  } catch (error) {
    console.log(error);
    return null;
  }
}

export const logoutAccount = async () => {
  try {
    await signOut();
  } catch (error) {
    console.log("error signing out: ", error);
  }
};

export const createLinkToken = async (user: User) => {
  try {
    const tokenParams = {
      user: {
        client_user_id: user.$id,
      },
      client_name: `${user.firstName} ${user.lastName}`,
      products: ["auth"] as Products[],
      language: "en",
      country_codes: ["US"] as CountryCode[],
    };

    const response = await plaidClient.linkTokenCreate(tokenParams);

    return parseStringify({ linkToken: response.data.link_token });
  } catch (error) {
    console.log(error);
  }
};

export const createBankAccount = async ({
  userId,
  bankId,
  accountId,
  accessToken,
  fundingSourceUrl,
  shareableId,
}: createBankAccountProps) => {
  try {
    // const bankAccount = await database.createDocument(
    //   DATABASE_ID!,
    //   BANK_COLLECTION_ID!,
    //   ID.unique(),
    //   {
    //     userId,
    //     bankId,
    //     accountId,
    //     accessToken,
    //     fundingSourceUrl,
    //     shareableId,
    //   }
    // );
    // return parseStringify(bankAccount);
  } catch (error) {
    console.log(error);
  }
};

export const exchangePublicToken = async ({
  publicToken,
  user,
}: exchangePublicTokenProps) => {
  try {
    // Exchange public token for access token and item ID
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // Get account information from Plaid using the access token
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accountData = accountsResponse.data.accounts[0];

    // Create a processor token for Dwolla using the access token and account ID
    const request: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountData.account_id,
      processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
    };

    const processorTokenResponse = await plaidClient.processorTokenCreate(
      request
    );
    const processorToken = processorTokenResponse.data.processor_token;

    // Create a funding source URL for the account using the Dwolla customer ID, processor token, and bank name
    const fundingSourceUrl = await addFundingSource({
      dwollaCustomerId: user.dwollaCustomerId,
      processorToken,
      bankName: accountData.name,
    });

    // If the funding source URL is not created, throw an error
    if (!fundingSourceUrl) throw Error;

    // Create a bank account using the user ID, item ID, account ID, access token, funding source URL, and shareableId ID
    await createBankAccount({
      userId: user.$id,
      bankId: itemId,
      accountId: accountData.account_id,
      accessToken,
      fundingSourceUrl,
      shareableId: encryptId(accountData.account_id),
    });

    // Revalidate the path to reflect the changes
    revalidatePath("/");

    // Return a success message
    return parseStringify({
      publicTokenExchange: "complete",
    });
  } catch (error) {
    console.error("An error occurred while creating exchanging token:", error);
  }
};

export const getBanks = async ({ userId }: getBanksProps) => {
  try {
    // const { database } = await createAdminClient();
    // const banks = await database.listDocuments(
    //   DATABASE_ID!,
    //   BANK_COLLECTION_ID!,
    //   [Query.equal("userId", [userId])]
    // );
    // console.log("banks.documents", banks.documents);
    // return parseStringify(banks.documents);
  } catch (error) {
    console.log(error);
  }
};

export const getBank = async ({ documentId }: getBankProps) => {
  try {
    // const { database } = await createAdminClient();
    // const bank = await database.listDocuments(
    //   DATABASE_ID!,
    //   BANK_COLLECTION_ID!,
    //   [Query.equal("$id", [documentId])]
    // );
    // console.log("bank.documents[0]", bank.documents[0]);
    // return parseStringify(bank.documents[0]);
  } catch (error) {
    console.log(error);
  }
};

export const getBankByAccountId = async ({
  accountId,
}: getBankByAccountIdProps) => {
  try {
    // const { database } = await createAdminClient();
    // const bank = await database.listDocuments(
    //   DATABASE_ID!,
    //   BANK_COLLECTION_ID!,
    //   [Query.equal("accountId", [accountId])]
    // );
    // if (bank.total !== 1) return null;
    // console.log("bank.documents[0]", bank.documents[0]);
    // return parseStringify(bank.documents[0]);
  } catch (error) {
    console.log(error);
  }
};
