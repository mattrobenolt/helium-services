import * as Cache from './cache';

const cache = { hits: 0, misses: 0, prev: 0 };

export const hit = () => cache.hits++;
export const miss = () => cache.misses++;

// TODO: Replace with Cron Triggers for periodic stats logging
// setInterval(() => {
//     const { hits, misses, prev } = cache;
//     const sum = hits + misses;
//     if (sum === prev) {
//         return;
//     }

//     cache.prev = sum;
//     console.log(
//         `Cache hit rate: ${hits} / ${misses} (${((hits / sum) * 100).toFixed(2)}% hit rate)`,
//     );

//     const { size, negative, count } = Cache.stats();
//     console.log(
//         `Cache size: ${count} (+ negative ${negative}) items in cache taking up ${size / 1024} KB`,
//     );
// }, 1000 * 60 * 60);
