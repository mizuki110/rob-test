const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api/lookup/:username', async (req, res) => {
  try {
    const username = req.params.username;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // This single API call gets the ID, name, and verified badge.
    const userLookupResponse = await axios.post(
      'https://users.roblox.com/v1/usernames/users',
      { usernames: [username], excludeBannedUsers: true }
    );

    const userData = userLookupResponse.data?.data?.[0];
    if (!userData) {
      return res.status(404).json({ error: 'User not found or is banned.' });
    }
    const userId = userData.id;

    // We now fetch all remaining data in parallel.
    const [
      pfpResponse,
      friendsResponse,
      followersResponse,
      followingResponse,
      profileResponse,
      badgesResponse
    ] = await Promise.all([
      axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`),
      axios.get(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
      axios.get(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
      axios.get(`https://friends.roblox.com/v1/users/${userId}/followings/count`),
      axios.get(`https://users.roblox.com/v1/users/${userId}`),
      axios.get(`https://badges.roblox.com/v1/users/${userId}/badges?limit=10&sortOrder=Desc`)
    ]);

    let badges = badgesResponse.data?.data || [];
    
    // If the user has badges, fetch their thumbnails
    if (badges.length > 0) {
      const badgeIds = badges.map(badge => badge.id);
      const thumbnailResponse = await axios.get(`https://thumbnails.roblox.com/v1/badges/icons?badgeIds=${badgeIds.join(',')}&size=150x150&format=Png&isCircular=true`);
      
      const thumbnailMap = new Map(thumbnailResponse.data.data.map(thumb => [thumb.targetId, thumb.imageUrl]));

      // Add the correct imageUrl to each badge
      badges.forEach(badge => {
        badge.iconImageUrl = thumbnailMap.get(badge.id) || '';
      });
    }

    const finalResponse = {
      id: userId,
      name: userData.name,
      displayName: userData.displayName,
      isVerified: userData.hasVerifiedBadge,
      description: profileResponse.data.description,
      created: profileResponse.data.created,
      profilePicture: pfpResponse.data?.data?.[0]?.imageUrl || '',
      friendsCount: friendsResponse.data?.count || 0,
      followersCount: followersResponse.data?.count || 0,
      followingCount: followingResponse.data?.count || 0,
      badges: badges
    };

    res.json(finalResponse);

  } catch (error) {
    console.error('Error in lookup:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.errors?.[0]?.message || 'An unexpected error occurred.';
    res.status(status).json({ error: message });
  }
});

// This is the crucial line for Fly.io compatibility
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
