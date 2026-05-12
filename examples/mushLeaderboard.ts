import { getPlayerInfo, getBedWarsLeaderboard } from './Mush/clientApi.js';
import { createSegment, drawSegments, mapWithConcurrency } from './Mush/drawLeaderboard.js';
import { Canvas } from 'skia-canvas';
import { parseMinecraftText } from '../src/render/minecraftPrefix.js';
import { writeFile } from "node:fs/promises";

const canvas = new Canvas(1000, 1080);
        const ctx = canvas.getContext("2d");

        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const leaderboardData = await getBedWarsLeaderboard();
        const records = leaderboardData.records.slice(0, 20);

        const profiles = await mapWithConcurrency(
            records,
            5,
            (record) => getPlayerInfo(record.account.username)
        )

        let y = 40;

        for (let i = 0; i < records.length; i++) {
            const record = records[i]!;
            const profile = profiles[i]!;
            const nick = record.account.username;

            const badgeFormat = profile.levelBadge_bw ?? `&7[${record["bedwars:level"]}]`;

            const segments = [
                createSegment(`#${record.pos} `, "#AAAAAA"),
                ...parseMinecraftText(`${badgeFormat} `),
                {
                ...createSegment(`${(profile.profile_name ?? "MEMBRO").toUpperCase()} `, profile.profile_color ?? "#AAAAAA"),  bold: true,
                },
                createSegment(`${nick} `, record.color),
            ];
            if (profile.clan_tag) {
                segments.push(
                    createSegment(`[${profile.clan_tag}] `, profile.clan_color ?? "#AAAAAA")
                );
            }

            await drawSegments(ctx, segments, 40, y, 4)
            y += 50;
        }

        const buffer = await canvas.toBuffer("png");
        await writeFile("leaderboard.png", buffer);

        console.log("Generated leaderboard.png");
