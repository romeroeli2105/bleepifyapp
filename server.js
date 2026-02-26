const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// HARDCODED KEYS
const CLIENT_ID = 'f5274f080aa44faba097ae6f14c21351';
const CLIENT_SECRET = '53d87f605280407dbeb49e9f04fb8c06';
const redirect_uri = 'https://bleepifyapp.com/callback';

app.get('/login', (req, res) => {
    const scope = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private';
    
    // This forces Node to perfectly format the URL so spaces cannot break it
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirect_uri,
        scope: scope,
        show_dialog: 'true'
    });
    
    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    if (!code) return res.send('No code provided.');

    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirect_uri
            }).toString(),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            }
        });

        res.redirect(`/?token=${response.data.access_token}`);
    } catch (error) {
        res.send('Error getting token. Check terminal.');
    }
});

app.get('/playlist-items', async (req, res) => {
    const { token, id } = req.query;
    if (!token || !id) return res.status(400).json({ error: 'Missing token or id' });

    try {
        const response = await axios.get('https://api.spotify.com/v1/playlists/' + id.trim() + '/items?limit=50', {
            headers: { 'Authorization': 'Bearer ' + token.trim() }
        });
        
        res.json(response.data);
    } catch (error) {
        console.error("SPOTIFY ERROR:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

app.get('/playlists', async (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'No token provided' });

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        res.json(response.data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch playlists' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/mass-bleep', async (req, res) => {
    const { token, playlistId, playlistName } = req.body;
    if (!token || !playlistId) return res.status(400).json({ error: 'Missing token or ID' });

    try {
        // 1. Get User ID
        const meRes = await axios.get('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': 'Bearer ' + token.trim() }
        });
        const userId = meRes.data.id;

        // 2. Fetch the original dirty items
        const itemsRes = await axios.get('https://api.spotify.com/v1/playlists/' + playlistId.trim() + '/items?limit=50', {
            headers: { 'Authorization': 'Bearer ' + token.trim() }
        });
        
        const originalItems = itemsRes.data.items;
        let finalUris = [];

        // 3. The Hunting Ground: Search Spotify for clean matches
        for (let obj of originalItems) {
            if (!obj.item) continue;
            
            const track = obj.item;
            if (track.explicit) {
                const query = encodeURIComponent(`track:${track.name} artist:${track.artists[0].name}`);
                
                const searchRes = await axios.get(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=10`, {
                    headers: { 'Authorization': 'Bearer ' + token.trim() }
                });
                
                const cleanMatch = searchRes.data.tracks.items.find(t => t.explicit === false);
                if (cleanMatch) {
                    finalUris.push(cleanMatch.uri);
                } else {
                    console.log(`Spotify hid the clean version for: ${track.name}`);
                }
            } else {
                finalUris.push(track.uri);
            }
        }

        if (finalUris.length === 0) return res.status(400).json({ error: 'No clean tracks found to build a playlist.' });

        // 4. Build the Empty Canvas (New Playlist)
        const createRes = await axios.post('https://api.spotify.com/v1/users/' + userId + '/playlists', {
            name: 'BLEEPED: ' + playlistName,
            description: "Cleaned by the BLEEP engine.",
            public: false
        }, {
            headers: { 'Authorization': 'Bearer ' + token.trim(), 'Content-Type': 'application/json' }
        });
        
        const newPlaylistId = createRes.data.id;
        const newPlaylistUrl = createRes.data.external_urls.spotify;

        // 5. Dump all the clean tracks inside
        await axios.post('https://api.spotify.com/v1/playlists/' + newPlaylistId + '/tracks', {
            uris: finalUris
        }, {
            headers: { 'Authorization': 'Bearer ' + token.trim(), 'Content-Type': 'application/json' }
        });

        res.json({ success: true, playlistUrl: newPlaylistUrl });

    } catch (error) {
        console.error("MASS BLEEP CRASH:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Backend failed to execute mass bleep' });
    }
});

module.exports = app;