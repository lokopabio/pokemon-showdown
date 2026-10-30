'use strict';
const BEFORE='        keys = list(sample_weights.keys())[:50]\n        values = list(sample_weights.values())[:50]';
const AFTER='        # BENITO FULL HYPOTHESIS SUPPORT: no insertion-order top-50 cutoff\n        keys = list(sample_weights.keys())\n        values = list(sample_weights.values())';
function patchSampler(text){const source=text.replace(/\r\n/g,'\n');if(source.includes(AFTER))return source;if(source.split(BEFORE).length!==2)throw Error('Unsupported unseen sampler: expected exactly one paired top-50 cutoff');return source.replace(BEFORE,AFTER);}
function patchPreparer(text){const source=text.replace(/\r\n/g,'\n'),marker='  const patches = [\n';if(source.includes(JSON.stringify(AFTER)))return source;if(source.split(marker).length!==2)throw Error('Unsupported bank preparation source');return source.replace(marker,marker+'    '+JSON.stringify(['fp/search/standard_battles.py',BEFORE,AFTER])+',\n');}
module.exports={BEFORE,AFTER,patchSampler,patchPreparer};
