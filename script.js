      const storyForm = document.getElementById('story-form');
        const generateBtn = document.getElementById('generate-btn');
        const buttonText = document.getElementById('button-text');
        const buttonIcon = document.getElementById('button-icon');
        const loadingIndicator = document.getElementById('loading-indicator');
        const errorMessage = document.getElementById('error-message');
        const errorText = document.getElementById('error-text');
        const storyResults = document.getElementById('story-results');
        const storyPromptInput = document.getElementById('story-prompt');
        
        // Modal elements
        const imageModal = document.getElementById('image-modal');
        const modalImg = document.getElementById('modal-img');
        const modalCloseBtn = document.getElementById('modal-close-btn');
        const modalContainer = document.getElementById('modal-container');

        // Cache for original story and state
        let originalStoryParts = [];
        let generatedLanguage = 'English';

        // --- Event Listeners ---
        storyForm.addEventListener('submit', handleStoryGeneration);
        
        // --- Core Functions ---
        async function handleStoryGeneration(event) {
            event.preventDefault();
            const prompt = storyPromptInput.value.trim();
            if (!prompt) {
                showError("Please enter a story idea.");
                return;
            }

            const language = document.getElementById('story-language').value;
            const genre = document.getElementById('story-genre').value;
            const tone = document.getElementById('story-tone').value;
            const audience = document.getElementById('story-audience').value;
            
            generatedLanguage = language; // Store the language for this session

            const fullPrompt = `
                Story Idea: "${prompt}"
                Genre: ${genre}
                Tone: ${tone}
                Target Audience: ${audience}
                Language to write the story in: ${language}
            `;

            // Reset UI
            setLoadingState(true);
            storyResults.innerHTML = '';
            document.getElementById('download-all-container').classList.add('hidden');
            hideError();

            try {
                // 1. Generate the story text and image prompts from the Gemini API
                const storyData = await generateStoryText(fullPrompt);

                const storyParts = [
                    storyData.story.introduction,
                    storyData.story.conflict,
                    storyData.story.climax,
                    storyData.story.resolution
                ];

                // Cache the original story
                originalStoryParts = storyParts.map(part => ({ ...part }));
                
                // Render text parts immediately
                renderStoryText(storyData.title, storyParts);

                // 2. Generate images for each story part in parallel
                const imagePromises = storyParts.map((part, index) => 
                    generateImageWithImagen(part.image_prompt, index).catch(err => {
                        console.error(`Error generating image for part ${index}:`, err);
                        return null; // Return null on failure to not break Promise.all
                    })
                );

                const imageUrls = await Promise.all(imagePromises);

                // 3. Render the generated images
                imageUrls.forEach((imageUrl, index) => {
                    if (imageUrl) {
                        renderImage(imageUrl, index);
                    } else {
                        renderImageError(index);
                    }
                });

            } catch (error) {
                console.error("An error occurred during story generation:", error);
                showError(error.message || "An unknown error occurred. Check the console and try again.");
            } finally {
                setLoadingState(false);
            }
        }
        
        /**
         * Generates story text using Google Gemini API.
         */
        async function generateStoryText(userPrompt) {
            const apiKey = "AIzaSyCJAWrW-DUXUeTSoC93ljpydogS6t1VuG4"; // API key will be provided by the environment.
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const systemPrompt = `You are a masterful storyteller, known for your deep and immersive narratives. Based on the user's prompt (which includes an idea, genre, tone, audience, and language), write a long, detailed, and emotionally deep story. The story's 'paragraph' text must be written in the language specified in the user's prompt (e.g., 'Language to write the story in: Hindi'). However, it is crucial that the 'image_prompt' text for the AI image generator is ALWAYS in English, regardless of the story's language.

The story must follow a clear narrative structure with four distinct parts: Introduction, Conflict, Climax, and Resolution. For each of these four parts, write a very long and detailed paragraph. Each paragraph should be substantial, exploring the characters' inner thoughts and feelings, providing rich, sensory descriptions of the environment, and building a more complex and engaging narrative.

For each part, also create a concise, visually descriptive prompt for an AI image generator (in English). This image prompt should be a comma-separated list of keywords describing the scene, characters, setting, mood, and style. The image prompt must be safe for work and avoid depicting direct violence or harm. Respond ONLY with a JSON object that matches the provided schema.`;

            const payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            title: { type: "STRING" },
                            story: {
                                type: "OBJECT",
                                properties: {
                                    introduction: {
                                        type: "OBJECT",
                                        properties: {
                                            paragraph: { type: "STRING" },
                                            image_prompt: { type: "STRING" }
                                        },
                                        required: ["paragraph", "image_prompt"]
                                    },
                                    conflict: {
                                        type: "OBJECT",
                                        properties: {
                                            paragraph: { type: "STRING" },
                                            image_prompt: { type: "STRING" }
                                        },
                                        required: ["paragraph", "image_prompt"]
                                    },
                                    climax: {
                                        type: "OBJECT",
                                        properties: {
                                            paragraph: { type: "STRING" },
                                            image_prompt: { type: "STRING" }
                                        },
                                        required: ["paragraph", "image_prompt"]
                                    },
                                    resolution: {
                                        type: "OBJECT",
                                        properties: {
                                            paragraph: { type: "STRING" },
                                            image_prompt: { type: "STRING" }
                                        },
                                        required: ["paragraph", "image_prompt"]
                                    }
                                },
                                required: ["introduction", "conflict", "climax", "resolution"]
                            }
                        },
                        required: ["title", "story"]
                    }
                }
            };

            const response = await fetchWithRetry(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (!candidate || !candidate.content?.parts?.[0]?.text) {
                console.error("Invalid response from Gemini text API:", result);
                throw new Error("Couldn't generate the story. The model's response was not valid.");
            }
            
            try {
                 return JSON.parse(candidate.content.parts[0].text);
            } catch (e) {
                console.error("Failed to parse JSON from story API:", candidate.content.parts[0].text);
                throw new Error("Couldn't parse the story from the model's response.");
            }
        }
        
        /**
         * Generates an image using Google Imagen 3 API.
         */
        async function generateImageWithImagen(imagePrompt, index) {
            console.log(`[Image ${index}] Requesting image with prompt: "${imagePrompt}"`);
            const apiKey = "AIzaSyCJAWrW-DUXUeTSoC93ljpydogS6t1VuG4"; // API key will be provided by the environment.
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
            
            const payload = {
                instances: [{ prompt: imagePrompt }],
                parameters: { "sampleCount": 1 }
            };

            try {
                const response = await fetchWithRetry(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                
                if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
                    console.log(`[Image ${index}] Image data received successfully.`);
                    return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
                } else {
                    const errorMessage = `[Image ${index}] Imagen API Error: Response received, but it contains no image data. This might be due to safety filters.`;
                    console.error(errorMessage);
                    console.error(`[Image ${index}] Failing Prompt:`, imagePrompt);
                    console.error(`[Image ${index}] API Response:`, JSON.stringify(result, null, 2));
                    throw new Error(`Couldn't generate image ${index}. The prompt might have been blocked.`);
                }
            } catch (error) {
                console.error(`[Image ${index}] An exception occurred while generating image:`, error);
                console.error(`[Image ${index}] Failing Prompt:`, imagePrompt);
                throw error;
            }
        }

        async function translateStoryToLanguage(partsToTranslate, targetLanguage) {
            const apiKey = "AIzaSyCJAWrW-DUXUeTSoC93ljpydogS6t1VuG4"; // API key will be provided by the environment.
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            
            const systemPrompt = `You are a translation expert. Translate the 'paragraph' value for each object in the user-provided JSON array into conversational, natural-sounding ${targetLanguage}. Return a JSON array with the exact same structure, containing only the translated paragraphs.`;
            const userPrompt = JSON.stringify(partsToTranslate.map(p => ({ paragraph: p.paragraph })));

            const payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                paragraph: { type: "STRING" }
                            },
                            required: ["paragraph"]
                        }
                    }
                }
            };
            
            const response = await fetchWithRetry(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (!candidate || !candidate.content?.parts?.[0]?.text) {
                console.error("Invalid response from Gemini translate API:", result);
                throw new Error("Translation failed. The model's response was not valid.");
            }

            try {
                return JSON.parse(candidate.content.parts[0].text);
            } catch (e) {
                console.error("Failed to parse JSON from translate API:", candidate.content.parts[0].text);
                throw new Error("Couldn't parse the translated story from the model's response.");
            }
        }

        // --- UI Rendering Functions ---
        function renderStoryText(title, storyParts) {
            let contentHtml = `<h2 class="text-3xl font-bold text-center mb-6">${title}</h2>`;
            const partHeadings = ["Introduction", "Conflict & Rising Action", "Climax", "Resolution"];
            storyParts.forEach((part, index) => {
                if(part) {
                    contentHtml += `
                        <div class="p-6 story-card story-card-3d">
                            <h3 class="text-xl font-bold text-gray-800 mb-3 pb-2 border-b border-gray-200">${partHeadings[index]}</h3>
                            <div id="image-container-${index}" class="w-full h-64 mb-4 image-loader">
                                <div class="loader"></div>
                            </div>
                            <p class="text-gray-700 leading-relaxed">${part.paragraph}</p>
                        </div>
                    `;
                }
            });
            storyResults.innerHTML = contentHtml;
            
            const downloadContainer = document.getElementById('download-all-container');
            downloadContainer.classList.remove('hidden');

            const downloadPdfBtn = document.getElementById('download-pdf-btn');
            const newDownloadPdfBtn = downloadPdfBtn.cloneNode(true);
            downloadPdfBtn.parentNode.replaceChild(newDownloadPdfBtn, downloadPdfBtn);
            newDownloadPdfBtn.addEventListener('click', handleDownloadPDF);
        }

        function renderImage(imageUrl, index) {
            const imageContainer = document.getElementById(`image-container-${index}`);
            if (imageContainer) {
                imageContainer.innerHTML = `<img src="${imageUrl}" alt="AI-generated illustration ${index + 1}" class="w-full h-full object-cover rounded-md cursor-pointer transition-transform duration-300 hover:scale-105">`;
                imageContainer.classList.remove('image-loader');

                const renderedImg = imageContainer.querySelector('img');
                if (renderedImg) {
                    renderedImg.addEventListener('click', () => {
                        openModal(imageUrl);
                    });
                }
            }
        }

        function renderImageError(index) {
            const imageContainer = document.getElementById(`image-container-${index}`);
            if (imageContainer) {
                imageContainer.classList.remove('image-loader');
                imageContainer.innerHTML = `
                    <div class="text-center text-orange-600 p-4 h-full flex flex-col justify-center items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-10 w-10" fill="none" viewBox="0 0 24" stroke="currentColor">
                           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p class="mt-2 text-sm font-medium">Image Generation Failed</p>
                        <p class="mt-1 text-xs">The prompt for this scene may have been blocked for safety reasons.</p>
                    </div>
                `;
                 imageContainer.classList.add('bg-orange-50', 'border', 'border-orange-200');
            }
        }
        
        function setLoadingState(isLoading) {
            generateBtn.disabled = isLoading;
            if (isLoading) {
                loadingIndicator.classList.remove('hidden');
                buttonText.textContent = 'Creating...';
                buttonIcon.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24" stroke="currentColor"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
            } else {
                loadingIndicator.classList.add('hidden');
                buttonText.textContent = 'Create My Story';
                buttonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 h-5 w-5"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2v0a10 10 0 0 0-1.08 19.95A10 10 0 0 0 12 2Z"/><path d="m9 13 2 2 4-4"/></svg>`;
            }
        }

        function showError(message) {
            errorText.textContent = message;
            errorMessage.classList.remove('hidden');
        }

        function hideError() {
            errorMessage.classList.add('hidden');
        }
        
        async function handleDownloadPDF() {
            const downloadBtn = document.getElementById('download-pdf-btn');
            if (!downloadBtn) return;

            downloadBtn.disabled = true;
            const btnSpan = downloadBtn.querySelector('span');
            const originalBtnText = btnSpan.textContent;
            btnSpan.textContent = 'Creating PDF...';

            try {
                let storyPartsForPDF;
                let titleForPDF = document.querySelector('#story-results h2')?.textContent || 'AI Story';

                if (generatedLanguage === 'Hindi') {
                    btnSpan.textContent = 'Translating for PDF...';
                    const translatedParts = await translateStoryToLanguage(originalStoryParts, 'English');
                    storyPartsForPDF = translatedParts.map(p => p.paragraph);

                    const translatedTitleArray = await translateStoryToLanguage([{paragraph: titleForPDF}], 'English');
                    if (translatedTitleArray && translatedTitleArray.length > 0) {
                        titleForPDF = translatedTitleArray[0].paragraph;
                    }
                } else {
                    storyPartsForPDF = originalStoryParts.map(p => p.paragraph);
                }

                btnSpan.textContent = 'Building PDF...';

                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

                const storyCards = document.querySelectorAll('.story-card');
                const pageMargin = 20;
                const contentWidth = pdf.internal.pageSize.getWidth() - (pageMargin * 2);
                const pageHeight = pdf.internal.pageSize.getHeight();
                const pageBottomMargin = pageHeight - pageMargin;

                // Page 1: Title Page
                pdf.setFontSize(28);
                pdf.setFont(undefined, 'bold');
                const splitTitle = pdf.splitTextToSize(titleForPDF, contentWidth);
                const titleX = pdf.internal.pageSize.getWidth() / 2;
                const titleY = pageHeight / 2;
                pdf.text(splitTitle, titleX, titleY, { align: 'center' });
                
                // Start a new page for the story content
                pdf.addPage();
                let currentY = pageMargin;

                for (let i = 0; i < storyCards.length; i++) {
                    const card = storyCards[i];
                    const headingElement = card.querySelector('h3');
                    const imageElement = card.querySelector('img');
                    const paragraphText = storyPartsForPDF[i] || '';

                    // Add some space between story parts, but not at the top of a new page
                    if (i > 0) {
                       currentY += 10;
                    }

                    // --- Add Heading ---
                    if (headingElement) {
                        pdf.setFontSize(18);
                        pdf.setFont(undefined, 'bold');
                        const splitHeading = pdf.splitTextToSize(headingElement.textContent, contentWidth);
                        const headingHeight = splitHeading.length * 8; // Approximation
                        if (currentY + headingHeight > pageBottomMargin) {
                            pdf.addPage();
                            currentY = pageMargin;
                        }
                        pdf.text(splitHeading, pageMargin, currentY);
                        currentY += headingHeight + 5; // Add some padding after heading
                    }

                    // --- Add Image ---
                    if (imageElement && imageElement.src.startsWith('data:image')) {
                        const imgData = imageElement.src;
                        try {
                            const imgProps = pdf.getImageProperties(imgData);
                            const imgHeight = (imgProps.height * contentWidth) / imgProps.width;
                            // If image alone is taller than a page, let it flow (it will be clipped but that's a jspdf limitation)
                            // If it's not taller, but would overflow, move to next page.
                            if (currentY + imgHeight > pageBottomMargin && imgHeight <= (pageBottomMargin - pageMargin)) {
                                pdf.addPage();
                                currentY = pageMargin;
                            }
                            pdf.addImage(imgData, 'PNG', pageMargin, currentY, contentWidth, imgHeight);
                            currentY += imgHeight + 5; // Add padding after image
                        } catch(e) {
                            console.error("Error adding image to PDF: ", e);
                             if (currentY + 15 > pageBottomMargin) {
                                pdf.addPage();
                                currentY = pageMargin;
                            }
                            pdf.setFontSize(10);
                            pdf.setFont(undefined, 'italic');
                            pdf.text('[Image could not be rendered]', pageMargin, currentY);
                            currentY += 15;
                        }
                    }

                    // --- Add Paragraph ---
                    if (paragraphText) {
                        pdf.setFontSize(12);
                        pdf.setFont(undefined, 'normal');
                        const splitText = pdf.splitTextToSize(paragraphText, contentWidth);
                        const textBlockHeight = splitText.length * 5; // A tighter approximation for 12pt font
                        
                        if (currentY + textBlockHeight > pageBottomMargin) {
                            pdf.addPage();
                            currentY = pageMargin;
                        }
                        
                        pdf.text(splitText, pageMargin, currentY);
                        currentY += textBlockHeight + 5;
                    }
                }
                
                const safeTitle = (document.querySelector('#story-results h2')?.textContent || 'My-AI-Story')
                                    .replace(/\s+/g, '_').replace(/[^\w-]/g, '');
                pdf.save(`${safeTitle}_English.pdf`);

            } catch (error) {
                console.error("Failed to create PDF file", error);
                showError("Could not create the PDF file. Check console for details.");
            } finally {
                downloadBtn.disabled = false;
                btnSpan.textContent = originalBtnText;
            }
        }


        // --- Modal Logic ---
        function openModal(imageUrl) {
            modalImg.src = imageUrl;
            imageModal.classList.remove('hidden');
            setTimeout(() => {
                modalContainer.classList.remove('scale-95', 'opacity-0');
            }, 10);
        }

        function closeModal() {
            modalContainer.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                imageModal.classList.add('hidden');
                modalImg.src = ''; 
            }, 300);
        }

        modalCloseBtn.addEventListener('click', closeModal);
        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal) {
                closeModal();
            }
        });
        
        async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, options);
                    if (!response.ok) {
                        const errorBody = await response.text();
                        console.error(`API Error Response: ${response.status}`, errorBody);
                        throw new Error(`API request failed with status ${response.status}`);
                    }
                    return response; 
                } catch (error) {
                    if (i < retries - 1) {
                        console.log(`Request failed, retrying in ${delay}ms...`);
                        await new Promise(res => setTimeout(res, delay));
                        delay *= 2; 
                    } else {
                        throw error; 
                    }
                }
            }
        }