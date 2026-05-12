export type LeaderboardResponse = {
    records: LeaderboardRecord[];
}

export type LeaderboardRecord = {
    pos: number;
    color: string;
    account: {
        profile_id: number;
        type: string;
        unique_id: string;
        username: string;
    };
    avatar_url: string;
    "bedwars:level": number;
    "bedwars:wins": number;
    "bedwars:kills": number;
    "bedwars:final_kills": number;
};

export async function getPlayer(nick: string) {
    const res = await fetch(`https://mush.com.br/api/player/${nick}`)
    const data = await res.json()

    return data;
}

export async function getPlayerInfo(nick: string) {
    const data = await getPlayer(nick);

    return {
        nick,
        tag: data.response?.best_tag?.name ?? null,
        tag_color: data.response?.best_tag?.color ?? null,
        profile_color: data.response?.profile_tag?.color ?? null,
        profile_name: data.response?.profile_tag?.name ?? null,
        clan_tag: data.response?.clan?.tag ?? null,
        clan_color: data.response?.clan?.tag_color ?? null,
        levelBadge_bw: data.response?.stats?.bedwars?.level_badge?.format ?? null,

    }
}

export async function getBedWarsLeaderboard(): Promise<LeaderboardResponse> {
    const res = await fetch("https://mush.com.br/api/leaderboard/bedwars");
    const data = await res.json() as LeaderboardResponse;

    return data;
}