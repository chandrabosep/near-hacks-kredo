ALTER TABLE "relayer_txs" RENAME COLUMN "l2_fee" TO "fee";--> statement-breakpoint
ALTER TABLE "relayer_txs" DROP COLUMN "l1_fee";