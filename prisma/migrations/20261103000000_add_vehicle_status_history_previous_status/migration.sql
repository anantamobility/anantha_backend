-- Preserve the status that preceded each status change.
-- Nullable so existing rows remain valid and the change is backward-compatible.
ALTER TABLE "vehicle_status_history" ADD COLUMN "previousStatus" "VehicleStatus";
