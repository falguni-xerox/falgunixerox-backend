const express = require('express');
const cors = require('cors');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const utapi = new UTApi();

// તારો જૂનો Manual Upload Route - એમ જ રહેવા દે
app.post('/upload', async (req, res) => {
  try {
    const { file } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'File required' });
    }

    const result = await utapi.uploadFilesFromBase64(file);
    
    if (result[0].error) {
      return res.status(500).json({ error: result[0].error.message });
    }

    res.json({ 
      success: true,
      url: result[0].data.url,
      name: result[0].data.name 
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/', (req, res) => {
  res.send('Falgunixerox Backend Running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
