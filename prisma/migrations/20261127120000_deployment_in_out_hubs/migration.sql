-- Rename the original hub column to the outbound hub of a deployment.
ALTER TABLE "vehicle_deployments" RENAME COLUMN "hubId" TO "outHubId";
ALTER TABLE "vehicle_deployments" RENAME CONSTRAINT "vehicle_deployments_hubId_fkey" TO "vehicle_deployments_outHubId_fkey";
ALTER INDEX "vehicle_deployments_hubId_idx" RENAME TO "vehicle_deployments_outHubId_idx";

-- Hub the vehicle returned to.
ALTER TABLE "vehicle_deployments" ADD COLUMN "inHubId" TEXT;
ALTER TABLE "vehicle_deployments" ADD CONSTRAINT "vehicle_deployments_inHubId_fkey" FOREIGN KEY ("inHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "vehicle_deployments_inHubId_idx" ON "vehicle_deployments"("inHubId");
