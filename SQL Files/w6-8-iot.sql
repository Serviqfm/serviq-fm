-- MKT-23 — IoT / BMS condition monitoring (MVP).
-- Run in the Supabase SQL editor BEFORE relying on the IoT monitoring page or the
-- POST /api/v1/sensor-readings ingest endpoint. Idempotent. Safe to run twice.
-- Styled after b8-asset-downtime.sql.
--
-- Design:
--   * sensor_devices — one row per physical sensor/BMS point, optionally bound to an
--     MEP asset. kind is free text (temperature/vibration/pressure/...); unit is the
--     display unit (°C, mm/s, bar, ...). min_threshold/max_threshold are the alert
--     band — a reading outside [min,max] is "out of threshold" (either bound nullable
--     = open-ended on that side).
--   * sensor_readings — append-only ledger. Machines POST readings through the ingest
--     endpoint (service-role, bypasses RLS); the monitoring page reads the latest per
--     device. No cached "current value" column — the page derives latest from the
--     ledger (small tables; add a cache only if reading volume ever demands it).
--   * The app must `next build` and run WITHOUT this migration: the IoT page shows an
--     empty list / surfaces the insert error; the ingest endpoint returns a clean 500.
--
-- Security posture (4-policy org RLS):
--   * SELECT: any org member.
--   * sensor_devices INSERT/UPDATE/DELETE: admin/manager only (registering devices and
--     setting alert bands is configuration work). WITH CHECK pins organisation_id and
--     binds asset_id to the same org.
--   * sensor_readings INSERT: any org member; WITH CHECK pins organisation_id and binds
--     device_id to that org. (The API ingest path uses the service-role client, which
--     bypasses RLS — org membership there is enforced in code by verifying the device
--     belongs to the key's org before insert.)
--   * sensor_readings UPDATE/DELETE: admin/manager only (readings are a machine ledger;
--     correcting bad rows is admin work).
--
-- Acceptance (owner, after running):
--   * anon-key SELECT returns only own-org devices/readings; cross-org INSERT denied.
--   * a technician cannot register a device; an admin can.
--   * a reading cannot reference an org-B device (FK-to-org bind).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.sensor_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  asset_id        UUID REFERENCES public.assets(id) ON DELETE SET NULL,  -- nullable: standalone sensors
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'temperature',  -- temperature/vibration/pressure/...
  unit            TEXT,                                 -- display unit: °C, mm/s, bar, ...
  min_threshold   NUMERIC,                              -- NULL = no lower bound
  max_threshold   NUMERIC,                              -- NULL = no upper bound
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sensor_readings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  device_id       UUID NOT NULL REFERENCES public.sensor_devices(id) ON DELETE CASCADE,
  value           NUMERIC NOT NULL,
  reading_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sensor_devices_org     ON public.sensor_devices(organisation_id);
CREATE INDEX IF NOT EXISTS idx_sensor_devices_asset   ON public.sensor_devices(asset_id);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_org    ON public.sensor_readings(organisation_id);
-- "latest reading for this device" lookup.
CREATE INDEX IF NOT EXISTS idx_sensor_readings_device ON public.sensor_readings(device_id, reading_at DESC);

-- ============================ sensor_devices RLS ============================
ALTER TABLE public.sensor_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sensor_devices_org_select ON public.sensor_devices;
CREATE POLICY sensor_devices_org_select ON public.sensor_devices
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: admin/manager; own org; asset bound to that org.
DROP POLICY IF EXISTS sensor_devices_org_insert ON public.sensor_devices;
CREATE POLICY sensor_devices_org_insert ON public.sensor_devices
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    AND (asset_id IS NULL OR asset_id IN (SELECT id FROM public.assets WHERE organisation_id = sensor_devices.organisation_id))
  );

-- UPDATE: admin/manager; WITH CHECK blocks org-swap and cross-org asset.
DROP POLICY IF EXISTS sensor_devices_org_update ON public.sensor_devices;
CREATE POLICY sensor_devices_org_update ON public.sensor_devices
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (asset_id IS NULL OR asset_id IN (SELECT id FROM public.assets WHERE organisation_id = sensor_devices.organisation_id))
  );

DROP POLICY IF EXISTS sensor_devices_org_delete ON public.sensor_devices;
CREATE POLICY sensor_devices_org_delete ON public.sensor_devices
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- ============================ sensor_readings RLS ============================
ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sensor_readings_org_select ON public.sensor_readings;
CREATE POLICY sensor_readings_org_select ON public.sensor_readings
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
  );

-- INSERT: any org member; device bound to that org. (API ingest uses service-role.)
DROP POLICY IF EXISTS sensor_readings_org_insert ON public.sensor_readings;
CREATE POLICY sensor_readings_org_insert ON public.sensor_readings
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND device_id IN (SELECT id FROM public.sensor_devices WHERE organisation_id = sensor_readings.organisation_id)
  );

-- UPDATE: admin/manager; WITH CHECK blocks org-swap and cross-org device.
DROP POLICY IF EXISTS sensor_readings_org_update ON public.sensor_readings;
CREATE POLICY sensor_readings_org_update ON public.sensor_readings
  FOR UPDATE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND device_id IN (SELECT id FROM public.sensor_devices WHERE organisation_id = sensor_readings.organisation_id)
  );

DROP POLICY IF EXISTS sensor_readings_org_delete ON public.sensor_readings;
CREATE POLICY sensor_readings_org_delete ON public.sensor_readings
  FOR DELETE USING (
    organisation_id IN (SELECT organisation_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
  );
