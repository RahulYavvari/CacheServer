import express from "express";
import { createClient } from 'redis';
import bodyParser from "body-parser";
import dotenv from "dotenv";

const PORT = 9000;

const app = express();
app.use(bodyParser.json());
dotenv.config();

const client = createClient();


client.on('error', err => console.log('Redis Client Error', err));

async function updateRedisConfig() {
    try {
        await client.sendCommand(['CONFIG', 'SET', 'maxmemory', '1000mb']);
        console.log('[LOG] Maxmemory updated to 1000mb');

        await client.sendCommand(['CONFIG', 'SET', 'maxmemory-policy', 'allkeys-lru']);
        console.log('[LOG] Maxmemory-policy updated to allkeys-lru');
    } catch (error) {
        console.error('[LOG] Error updating Redis config:', error);
    }
}

async function redisInit() {
    await client.connect();
    await updateRedisConfig();

    let cacheHits = await client.get('CACHE_HITS');
    let cacheMisses = await client.get('CACHE_MISSES');

    if (!cacheHits) {
        await client.set('CACHE_HITS', String(0));
    }

    if (!cacheMisses) {
        await client.set('CACHE_MISSES', String(0));
    }
}

app.post("/api/v1/cache/set", async (req, res) => {
    try {
        const { key, value } = req.query;
        if(key.trim() != null) {
            await client.set(key, value);
            res.status(200).json(({ status: "success" }));
        } else {
            res.status(400).json({status: "failed", errorCode: "9001", message: "invalid key. \'key\' should not be null"})
        }
    } catch (err) {
        console.error("[LOG] Some error occured at /cache/set", err);
        res.status(500).json(({ status: "failed", errorCode: "9002", message: "error while set() key and value" }));
    }
});

app.get("/api/v1/cache/get", async (req, res) => {
    try {
        const { key } = req.query;
        const value = await client.get(key.trim());
        if (value == null) {
            let currMisses = await client.get('CACHE_MISSES');
            await client.set('CACHE_MISSES', String(Number(currMisses) + 1));
        } else {
            let currHits = await client.get('CACHE_HITS');
            await client.set('CACHE_HITS', String(Number(currHits) + 1));
        }
        res.status(200).json(({ value }));
    } catch (err) {
        console.error("[LOG] Some error occured at /cache/get", err);
        res.status(500).json(({ value: "-1" }));
    }
});

app.get("/api/v1/cache/stats", async (req, res) => {
    try {
        let hitMissRatio = 0;
        const hits = await client.get('CACHE_HITS');
        const misses = await client.get('CACHE_MISSES');
        hitMissRatio = hits / misses;
        res.status(200).json(({ "cache_hits": hits, "cache_misses": misses, "hit_miss_ratio": hitMissRatio }));
    } catch (err) {
        res.status(200).json({status: "failed", errorCode: 9100, message: "error occured while get() hits and misses"})
    }
});

app.delete('/api/v1/cache/cleardatabase', async (req, res) => {
    try {

        const { secret } = req.query;
        if(secret == process.env.ADMIN_SECRET) {
            await client.sendCommand(['FLUSHDB', 'ASYNC']);
            res.status(200).json({status: "success", message: "cache database flushed successfully"});
        } else {
            res.status(400).json({status: "failed", message: "Unauthorized access!"});
        }
    } catch(err) {
        console.log("[LOG] Error while flushing db", err);
        res.status(500).json({status: "failed", errorCode: "9200", message: "Some error occured while flushing the cache db"})
    }
        
});

app.listen(process.env.PORT || PORT, async () => {
    await redisInit();
    console.log("[LOG] Redis Server connected!");
    console.log("[LOG] Cache Server listening on port 9000");
});
