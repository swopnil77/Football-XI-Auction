/**
 * Seeds Supabase `players` and `managers` tables from data/players.json and data/managers.json.
 *
 * Usage:
 *   1. Copy .env.example to .env.local and fill in your Supabase project values
 *      (needs SUPABASE_SERVICE_ROLE_KEY, found in Supabase → Project Settings → API).
 *   2. npm run seed
 *
 * Safe to re-run — it upserts on `name` so editing the JSON and re-running just updates rows.
 * As you grow the dataset toward the full 15 GK / 70 DEF / 70 MID / 70 FWD / 20 managers,
 * just keep adding entries to the JSON files and re-run this script.
 */
import 'dotenv/config';
import { createServiceClient } from '../lib/supabase/server';
import playersData from '../data/players.json';
import managersData from '../data/managers.json';

async function main() {
  const supabase = createServiceClient();

  console.log(`Seeding ${playersData.length} players...`);
  for (const p of playersData as any[]) {
    const { error } = await supabase.from('players').upsert(
      {
        name: p.name,
        position: p.position,
        position_group: p.positionGroup,
        rating: p.rating,
        skill: p.skill,
        nationality: p.nationality ?? null,
        national_team: p.nationalTeam ?? null,
        national_years: p.nationalYears ?? null,
        clubs: p.clubs ?? [],
        era: p.era ?? null,
        current_2026: p.current2026 ?? false,
        image_url: p.imageUrl ?? null,
      },
      { onConflict: 'name' }
    );
    if (error) console.error(`  ✗ ${p.name}:`, error.message);
  }

  console.log(`Seeding ${managersData.length} managers...`);
  for (const m of managersData as any[]) {
    const { error } = await supabase.from('managers').upsert(
      {
        name: m.name,
        preferred_formation: m.preferredFormation ?? null,
        clubs: m.clubs ?? [],
        national_teams: m.nationalTeams ?? [],
        image_url: m.imageUrl ?? null,
      },
      { onConflict: 'name' }
    );
    if (error) console.error(`  ✗ ${m.name}:`, error.message);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
