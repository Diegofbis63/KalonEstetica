
import pkgNlp from 'node-nlp';
const NlpManager = (pkgNlp as any).NlpManager || pkgNlp;
import fs from 'fs';
import path from 'path';

let manager: any = null;

export async function getNlpManager() {
    console.log("[nlp.ts] Requesting NLP Manager...");
    if (manager) return manager;
    
    manager = new NlpManager({ 
        languages: ['es'], 
        autoSave: false, 
        forceNER: false, 
        nlp: { useNativeSentiment: false } 
    });
    
    try {
        const modelPath = path.join(process.cwd(), 'Entrenamiento NLP', 'model-es.json');
        if (fs.existsSync(modelPath)) {
            console.log("[nlp.ts] Loading model from:", modelPath);
            const data = fs.readFileSync(modelPath, 'utf8');
            manager.import(data);
        } else {
            console.log("[nlp.ts] Model not found, looking for corpus...");
            const corpusPath = path.join(process.cwd(), 'Entrenamiento NLP', 'corpus-es.json');
            if (fs.existsSync(corpusPath)) {
                console.log("[nlp.ts] Training with corpus from:", corpusPath);
                const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
                manager.addCorpus(corpus);
                await manager.train();
            } else {
                console.error("[nlp.ts] No model or corpus found!");
            }
        }
    } catch (error) {
        console.error("[nlp.ts] Error initializing NLP manager:", error);
    }
    
    return manager;
}
