function modulateAiNodeModel(aiNodeInference, hasImageNodes) {
    const { provider, model } = aiNodeInference;

    // Check if the local or global model is set to ollama.
    const isOllamaSelected = provider === 'ollama' ||
        (provider === 'GLOBAL' && document.getElementById('model-select').value === 'ollama');

    // If image nodes are present, and ollama is not selected, use the vision model.
    if (hasImageNodes && !isOllamaSelected) {
        return { provider: 'OpenAi', model: 'gpt-4o' };
    } else if (hasImageNodes && isOllamaSelected) {
        // If ollama is selected and there are image nodes, either as local or global model, use LLaVA 7B
        return { provider: 'ollama', model: 'LLaVA' };
    } else if (provider === 'GLOBAL') {
        return determineGlobalModel();
    } else {
        // Use the local model selection
        return { provider, model };
    }
}


// Function to calculate token cost for an image based on resolution and detail
function calculateImageTokenCost(width, height, detailLevel) {
    if (detailLevel === 'low') {
        return 85; // Low detail images cost a fixed 85 tokens
    }

    // For high detail images
    let initialResizeWidth = Math.min(width, 2048);
    let initialResizeHeight = Math.min(height, 2048);
    let scale = 768 / Math.min(initialResizeWidth, initialResizeHeight);
    let scaledWidth = Math.floor(initialResizeWidth * scale);
    let scaledHeight = Math.floor(initialResizeHeight * scale);

    // Calculate the number of 512px tiles needed
    let tilesWidth = Math.ceil(scaledWidth / 512);
    let tilesHeight = Math.ceil(scaledHeight / 512);
    let totalTiles = tilesWidth * tilesHeight;

    // Each high detail tile costs 170 tokens, plus an additional 85 tokens
    return (totalTiles * 170) + 85;
}

// Convert a blob URL to base64 data
function convertImageToBase64(blobUrl) {
    return new Promise((resolve, reject) => {
        // Fetch the blob data from the blob URL
        fetch(blobUrl)
            .then(response => response.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result.split(',')[1]); // Return the base64 string without the prefix
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob); // Read the blob as data URL
            })
            .catch(error => {
                console.error('Error fetching or converting the blob URL:', error);
                reject(error);
            });
    });
}


async function getImageNodeData(node) {
    // If the image data is a blob URL, convert it to base64
    if (node.imageData.startsWith('blob:')) {
        try {
            const base64Data = await convertImageToBase64(node.imageData);
            return {
                type: 'image_data',
                image_data: base64Data // Return the base64-encoded image data
            };
        } catch (error) {
            console.error('Error converting blob to base64:', error);
            return null;
        }
    }

    // If there's already base64-encoded imageData
    if (node.imageData) {
        return {
            type: 'image_data',
            image_data: node.imageData // Assuming this is already base64-encoded
        };
    }

    // If there's no image data, return null
    return null;
}

async function callVisionModel(messages, onStreamComplete) {
    const inferenceOverride = {
        provider: 'OpenAi',
        model: 'gpt-4o'
    };

    callAiApi({
        messages: messages,
        stream: true, // Assuming streaming is not required for vision model
        customTemperature: null, // Or specify a custom temperature if needed
        onBeforeCall: () => {
            isAiProcessing = true;
            updateUiForProcessing();
        },
        onStreamingResponse: (content) => {
            neuriteFunctionCM.getDoc().replaceRange(content, CodeMirror.Pos(neuriteFunctionCM.lastLine()));
        },
        onAfterCall: () => {
            isAiProcessing = false;
            updateUiForIdleState();
            if (onStreamComplete) onStreamComplete(); // Call the callback after streaming is complete
        },
        onError: (error) => {
            functionErrorIcon.style.display = 'block';
            console.error("Error:", error);
        },
        inferenceOverride: inferenceOverride,
    });
}