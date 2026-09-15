// Generated from the public portion of stream configuration; never contains credentials.
export interface StreamProvider { id: string; name: string; origin: string; enabled: boolean; moviePath?: string; tvPath?: string; animePath?: string; languages: string[]; autoVariants: string[]; manualAnime: boolean; singleAudio: boolean; animeIssue: string }
export const streamCatalog: { providers: StreamProvider[] } = {
  "providers": [
    {
      "id": "moviesapi",
      "name": "MoviesAPI",
      "origin": "https://moviesapi.to",
      "enabled": true,
      "moviePath": "/movie/{id}?theme=064be4",
      "tvPath": "/tv/{id}/{season}/{episode}?theme=064be4",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "vidlink",
      "name": "VidLink",
      "origin": "https://vidlink.pro",
      "enabled": true,
      "moviePath": "/movie/{id}?autoplay=false&title=false",
      "tvPath": "/tv/{id}/{season}/{episode}?autoplay=false&title=false",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "vidfast",
      "name": "VidFast",
      "origin": "https://vidfast.vc",
      "enabled": true,
      "moviePath": "/movie/{id}?autoplay=false&title=false",
      "tvPath": "/tv/{id}/{season}/{episode}?autoplay=false&title=false",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "cinezo",
      "name": "Cinezo",
      "origin": "https://player.cinezo.live",
      "enabled": true,
      "moviePath": "/embed/movie/{id}?autoplay=false",
      "tvPath": "/embed/tv/{id}/{season}/{episode}?autoplay=false",
      "animePath": "/embed/anime/{id}/{episode}?dub={dub}&autoplay=false",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": "Unavailable: anime route opens a demo"
    },
    {
      "id": "rivestream",
      "name": "Rivestream",
      "origin": "https://www.rivestream.app",
      "enabled": true,
      "moviePath": "/embed?type=movie&id={id}",
      "tvPath": "/embed?type=tv&id={id}&season={season}&episode={episode}",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "anixo",
      "name": "AniXo",
      "origin": "https://anixo.buzz",
      "enabled": true,
      "animePath": "/embed/ani/{id}/{episode}/{language}?autoplay=false",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "supaplay",
      "name": "SupaPlay",
      "origin": "https://supaplay.fun",
      "enabled": true,
      "animePath": "/stream/ani/{id}/{episode}/{language}",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": "Unavailable: anime matching returned a different title"
    },
    {
      "id": "megaplay",
      "name": "MegaPlay",
      "origin": "https://megaplay.buzz",
      "enabled": true,
      "animePath": "/stream/ani/{id}/{episode}/{language}",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "animeplayer",
      "name": "Anime Player",
      "origin": "https://ani.megaplay.su",
      "enabled": true,
      "animePath": "/ani/{id}/{episode}/{language}",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "dropfile",
      "name": "DropFile",
      "origin": "https://dropfile.cc",
      "enabled": true,
      "animePath": "/player/tv/anilist-{id}/1/{episode}?audio={language}&lang=en&autoplay=0",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "anilink",
      "name": "AniLink",
      "origin": "https://anilink.cc",
      "enabled": true,
      "animePath": "/watch/{id}/{episode}?variant={language}&autoplay=1",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": true,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "tryembed",
      "name": "TryEmbed",
      "origin": "https://tryembed.us.cc",
      "enabled": true,
      "animePath": "/embed/anime/{id}/{episode}/{language}",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [
        "sub"
      ],
      "manualAnime": true,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "cinextream",
      "name": "CineXtream",
      "origin": "https://cinextream.cc",
      "enabled": true,
      "animePath": "/api/embed/anime/{language}/{id}/{episode}?color=064be4",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": true,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "nontongo",
      "name": "Nontongo",
      "origin": "https://nontongo.win",
      "enabled": true,
      "animePath": "/anime/{id}/{episode}/play",
      "languages": [
        "sub"
      ],
      "autoVariants": [],
      "manualAnime": true,
      "singleAudio": true,
      "animeIssue": ""
    },
    {
      "id": "4animo",
      "name": "4Animo",
      "origin": "https://cdn.4animo.xyz",
      "enabled": true,
      "animePath": "/embed/ani/{id}/{episode}/{language}",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": true,
      "singleAudio": false,
      "animeIssue": ""
    },
    {
      "id": "miruro",
      "name": "Miruro",
      "origin": "@local",
      "enabled": true,
      "animePath": "/anime-player/{id}/{episode}/{language}",
      "languages": [
        "sub",
        "dub"
      ],
      "autoVariants": [],
      "manualAnime": false,
      "singleAudio": false,
      "animeIssue": ""
    }
  ]
};
