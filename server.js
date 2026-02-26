const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// HARDCODED KEYS
const CLIENT_ID = 'f5274f080aa44faba097ae6f14c21351';
const CLIENT_SECRET = '53d87f605280407dbeb49e9f04fb8c06';
const redirect_uri = 'https://bleepifyapp.com/callback';
app.get('/login', (req, res) => {
const scope = 'user-read-private%20user-read-email%20playlist-read-private%20playlist-read-collaborative%20playlist-modify-public%20playlist-modify-private';
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${encodeURIComponent(scope)}`;
    res.redirect(authUrl);
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

app.get('/playlist-tracks', async (req, res) => {
    const { token, id } = req.query;
    if (!token || !id) return res.status(400).json({ error: 'Missing token or id' });

    try {
        // Nuke any invisible spaces or newlines that might cause a 400 error
        const cleanId = id.trim();
        const cleanToken = token.trim();

        const response = await axios.get('https://api.spotify.com/v1/playlists/' + cleanId + '/tracks?limit=50', {
            headers: { 'Authorization': 'Bearer ' + cleanToken }
        });
        res.json(response.data);
    } catch (error) {
        // Log EXACTLY what Spotify is complaining about, not just the generic Axios error
        console.error("SPOTIFY ERROR:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch tracks' });
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

app.listen(3000, () => console.log('Bleep backend is ALIVE'));