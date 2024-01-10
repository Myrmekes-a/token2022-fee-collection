import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";

import {
  TOKEN_2022_PROGRAM_ID,
  unpackAccount,
  getTransferFeeAmount,
  withdrawWithheldTokensFromAccounts,
} from "@solana/spl-token";

import fs from "fs";
import { CronJob } from "cron";

// Local wallet from keypair json
const loadWalletKey = (keypair: string): Keypair => {
  if (!keypair || keypair == "") {
    throw new Error("Keypair is required!");
  }
  const loaded = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString()))
  );
  return loaded;
};

const MINT = new PublicKey("3reRsoxaj5Cn2mMYtQ3NBnq14o4mfaszHY9aYb1BvjVa");
const TREASURY_WALLET = new PublicKey(
  "EoGmEccBukEUU21AgwekcK9TNhR2gozi1qWQkpekrxXn"
);
const WITHDRAW_WITHHELD_AUTHORITY = new PublicKey(
  "51QHr8aS4En232fPCWUYLxWYw4crwxeap56n4jF1283Y"
);

const payer = loadWalletKey("./keys/cli-wallet.json");
const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

// Withheld cron job will be triggere every 30s
const cronJob = new CronJob("*/30 * * * * *", async () => {
  // Find all token fee existed ATAs
  const allAccounts = await connection.getProgramAccounts(
    TOKEN_2022_PROGRAM_ID,
    {
      commitment: "confirmed",
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: MINT.toString(),
          },
        },
      ],
    }
  );

  // Collect fee to TREASURY_WALLET simply by loop
  const accountsToWithdrawFrom: PublicKey[] = [];
  for (const accountInfo of allAccounts) {
    const account = unpackAccount(
      accountInfo.pubkey,
      accountInfo.account,
      TOKEN_2022_PROGRAM_ID
    );
    const transferFeeAmount = getTransferFeeAmount(account);
    if (
      transferFeeAmount !== null &&
      transferFeeAmount.withheldAmount > BigInt(0)
    ) {
      accountsToWithdrawFrom.push(accountInfo.pubkey);
      const result = await withdrawWithheldTokensFromAccounts(
        connection,
        payer,
        MINT,
        TREASURY_WALLET,
        WITHDRAW_WITHHELD_AUTHORITY,
        [],
        [accountInfo.pubkey],
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
    }
  }
});

if (!cronJob.running) {
  cronJob.start();
}
