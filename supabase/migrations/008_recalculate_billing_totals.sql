-- Migration 008: Recalculate all $0 billing cycle totals for Fuji, Evolved, and AXUS
-- Applies corrected totals for cycles where grand_total = 0
-- AXUS special rule: flat $1,300/month storage (regardless of storage_weekly rows)
-- Fuji / Evolved: sum storage_weekly.total_ex per cycle (0 if no rows)

DO $$
DECLARE
  axus_client_id UUID := 'e539b28f-7ebc-4fa8-981e-a558c6ec88c0';
  fuji_client_id UUID := '8edf2fb9-1171-42f8-8b43-ff3aa403dc94';
  evolved_client_id UUID := '98646999-87ac-4a05-9c0b-6411727c9c43';

  v_id              UUID;
  v_client_id       UUID;
  v_total_runup     DECIMAL(10,2);
  v_total_delivery  DECIMAL(10,2);
  v_total_fuel      DECIMAL(10,2);
  v_total_install   DECIMAL(10,2);
  v_total_toner     DECIMAL(10,2);
  v_total_storage   DECIMAL(10,2);
  v_subtotal        DECIMAL(10,2);
  v_gst             DECIMAL(10,2);
  v_grand_total     DECIMAL(10,2);
BEGIN
  FOR v_id, v_client_id IN
    SELECT id, client_id
    FROM billing_cycles
    WHERE client_id IN (axus_client_id, fuji_client_id, evolved_client_id)
      AND grand_total = 0
    ORDER BY client_id, period_start
  LOOP

    -- 1. Runup total
    SELECT COALESCE(SUM(rd.unit_price), 0)
      INTO v_total_runup
      FROM runup_details rd
      JOIN jobs j ON j.id = rd.job_id
     WHERE j.billing_cycle_id = v_id;

    -- 2. Delivery + collection total (total_price already includes fuel surcharge)
    SELECT COALESCE(SUM(dd.total_price), 0)
      INTO v_total_delivery
      FROM delivery_details dd
      JOIN jobs j ON j.id = dd.job_id
     WHERE j.billing_cycle_id = v_id
       AND j.job_type IN ('delivery','collection');

    -- 3. Fuel surcharge component (stored separately for reporting)
    SELECT COALESCE(SUM(dd.fuel_surcharge_amt), 0)
      INTO v_total_fuel
      FROM delivery_details dd
      JOIN jobs j ON j.id = dd.job_id
     WHERE j.billing_cycle_id = v_id
       AND j.job_type IN ('delivery','collection');

    -- 4. Install total
    SELECT COALESCE(SUM(id2.unit_price), 0)
      INTO v_total_install
      FROM install_details id2
      JOIN jobs j ON j.id = id2.job_id
     WHERE j.billing_cycle_id = v_id;

    -- 5. Toner total
    SELECT COALESCE(SUM(tor.total_price), 0)
      INTO v_total_toner
      FROM toner_orders tor
      JOIN jobs j ON j.id = tor.job_id
     WHERE j.billing_cycle_id = v_id;

    -- 6. Storage total — AXUS flat $1,300; others sum storage_weekly
    IF v_client_id = axus_client_id THEN
      v_total_storage := 1300.00;
    ELSE
      SELECT COALESCE(SUM(sw.total_ex), 0)
        INTO v_total_storage
        FROM storage_weekly sw
       WHERE sw.billing_cycle_id = v_id;
    END IF;

    -- 7. Derived totals
    -- Note: fuel surcharge is already inside total_delivery, so subtotal does NOT double-count it
    v_subtotal    := v_total_runup + v_total_delivery + v_total_install + v_total_toner + v_total_storage;
    v_gst         := ROUND(v_subtotal * 0.10, 2);
    v_grand_total := v_subtotal + v_gst;

    UPDATE billing_cycles
       SET total_runup            = v_total_runup,
           total_delivery         = v_total_delivery,
           total_fuel_surcharge   = v_total_fuel,
           total_install          = v_total_install,
           total_toner            = v_total_toner,
           total_storage          = v_total_storage,
           total_inwards_outwards = 0,
           subtotal               = v_subtotal,
           gst_amount             = v_gst,
           grand_total            = v_grand_total
     WHERE id = v_id;

    RAISE NOTICE 'Updated cycle % (client %) → runup=% delivery=% install=% toner=% storage=% subtotal=% gst=% grand_total=%',
      v_id, v_client_id,
      v_total_runup, v_total_delivery, v_total_install, v_total_toner, v_total_storage,
      v_subtotal, v_gst, v_grand_total;

  END LOOP;

  RAISE NOTICE 'Migration 008 complete.';
END;
$$;
