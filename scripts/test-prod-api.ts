async function testProd() {
    console.log("--- INICIANDO PRUEBA DE ORO EN LOCAL ---");
    const url = 'http://localhost:3000/api/chat';
    const payload = {
        message: "¿Cuáles son los servicios de limpieza de cutis que ofrecen? Listalos por favor.",
        messages: [],
        clientPhone: "3512345678"
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log(`STATUS: ${response.status}`);
        
        if (!response.body) {
            console.log("Error: No body in response");
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log("\\n--- STREAM COMPLETADO ---");
                break;
            }
            
            const text = decoder.decode(value);
            const lines = text.split('\\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.replace('data: ', '').trim();
                    if (dataStr === '[DONE]') {
                        // handled by done
                    } else if (dataStr) {
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                                process.stdout.write(data.choices[0].delta.content);
                            }
                        } catch (e) {
                            // ignore incomplete chunks for simple testing
                        }
                    }
                }
            }
        }
        console.log("\\n--- PRUEBA FINALIZADA ---");
    } catch (e) {
        console.error("Test Falló:", e);
    }
}

testProd();
