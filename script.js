class HGHFeedChecker {
    constructor() {
        this.feedUrl = 'https://feed.homegrownhits.xyz/feed.xml';
        this.feedData = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const fetchButton = document.getElementById('fetchFeed');
        const clearButton = document.getElementById('clearData');
        
        if (fetchButton) {
            fetchButton.addEventListener('click', () => {
                console.log('Fetch button clicked');
                this.fetchFeed();
            });
        } else {
            console.error('Fetch button not found');
        }
        
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                console.log('Clear button clicked');
                this.clearData();
            });
        } else {
            console.error('Clear button not found');
        }
    }

    async fetchFeed() {
        this.updateStatus('loading', 'Fetching feed...');
        console.log('Fetching feed from:', this.feedUrl);
        
        try {
            // Try direct fetch first
            let response;
            try {
                response = await fetch(this.feedUrl);
                console.log('Direct fetch successful');
            } catch (directError) {
                console.log('Direct fetch failed, trying CORS proxy:', directError.message);
                // Use a CORS proxy to avoid CORS issues
                const proxyUrl = 'https://api.allorigins.win/raw?url=';
                const fullUrl = proxyUrl + encodeURIComponent(this.feedUrl);
                console.log('Using proxy URL:', fullUrl);
                response = await fetch(fullUrl);
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const xmlText = await response.text();
            console.log('Received XML text, length:', xmlText.length);
            this.parseFeed(xmlText);
            
        } catch (error) {
            console.error('Error fetching feed:', error);
            this.updateStatus('error', `Error: ${error.message}`);
        }
    }

    parseFeed(xmlText) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            
            if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
                throw new Error('Invalid XML format');
            }

            this.feedData = this.extractFeedData(xmlDoc);
            this.displayFeedData();
            this.updateStatus('success', 'Feed loaded successfully!');
            
        } catch (error) {
            console.error('Error parsing feed:', error);
            this.updateStatus('error', `Parse error: ${error.message}`);
        }
    }

    extractFeedData(xmlDoc) {
        const channel = xmlDoc.querySelector('channel');
        const items = xmlDoc.querySelectorAll('item');
        const liveItems = xmlDoc.querySelectorAll('liveItem');

        // Extract channel info
        const channelInfo = {
            title: this.getTextContent(channel, 'title'),
            description: this.getTextContent(channel, 'description'),
            language: this.getTextContent(channel, 'language'),
            link: this.getTextContent(channel, 'link'),
            lastBuildDate: this.getTextContent(channel, 'lastBuildDate'),
            pubDate: this.getTextContent(channel, 'pubDate'),
            image: this.getTextContent(channel, 'image > url'),
            explicit: this.getTextContent(channel, 'itunes\\:explicit'),
            category: this.getTextContent(channel, 'itunes\\:category'),
            keywords: this.getTextContent(channel, 'itunes\\:keywords'),
            author: this.getTextContent(channel, 'itunes\\:author'),
            email: this.getTextContent(channel, 'itunes\\:owner > itunes\\:email'),
            complete: this.getTextContent(channel, 'podcast\\:complete'),
            block: this.getTextContent(channel, 'podcast\\:block'),
            medium: this.getTextContent(channel, 'podcast\\:medium'),
            guid: this.getTextContent(channel, 'podcast\\:guid')
        };

        // Extract episodes
        const episodes = Array.from(items).map(item => ({
            title: this.getTextContent(item, 'title'),
            description: this.getTextContent(item, 'description'),
            guid: this.getTextContent(item, 'guid'),
            pubDate: this.getTextContent(item, 'pubDate'),
            duration: this.getTextContent(item, 'itunes\\:duration'),
            explicit: this.getTextContent(item, 'itunes\\:explicit'),
            image: this.getTextContent(item, 'itunes\\:image'),
            enclosure: {
                url: this.getAttribute(item, 'enclosure', 'url'),
                type: this.getAttribute(item, 'enclosure', 'type'),
                length: this.getAttribute(item, 'enclosure', 'length')
            },
            chapters: (() => {
                const chaptersUrl = this.getAttribute(item, 'podcast\\:chapters', 'url');
                console.log('Chapter extraction for:', this.getTextContent(item, 'title'), 'URL:', chaptersUrl);
                
                // Debug: Check what podcast:chapters elements exist
                const chaptersElements = item.querySelectorAll('chapters');
                console.log('Found chapters elements:', chaptersElements.length);
                if (chaptersElements.length > 0) {
                    chaptersElements.forEach((el, i) => {
                        console.log(`Chapters element ${i}:`, el.outerHTML);
                    });
                }
                
                return chaptersUrl;
            })(),
            persons: this.extractPersons(item),
            value: (() => {
                const valueData = this.extractValueInfo(item);
                console.log('Value4Value extraction for:', this.getTextContent(item, 'title'), 'Data:', valueData);
                if (valueData && valueData.timeSplits && valueData.timeSplits.length > 0) {
                    console.log('Time splits found:', valueData.timeSplits);
                }
                return valueData;
            })(),
            tracks: this.extractTracks(item)
        }));

        // Extract live items
        const liveItemsData = Array.from(liveItems).map(liveItem => ({
            title: this.getTextContent(liveItem, 'title'),
            status: this.getAttribute(liveItem, 'liveItem', 'status'),
            start: this.getAttribute(liveItem, 'liveItem', 'start'),
            end: this.getAttribute(liveItem, 'liveItem', 'end'),
            chat: this.getAttribute(liveItem, 'liveItem', 'chat'),
            enclosure: {
                url: this.getAttribute(liveItem, 'enclosure', 'url'),
                type: this.getAttribute(liveItem, 'enclosure', 'type'),
                length: this.getAttribute(liveItem, 'enclosure', 'length')
            },
            link: this.getTextContent(liveItem, 'link'),
            value: this.extractValueInfo(liveItem)
        }));

        return {
            channel: channelInfo,
            episodes: episodes,
            liveItems: liveItemsData
        };
    }

    getTextContent(element, selector) {
        const el = element.querySelector(selector);
        return el ? el.textContent.trim() : '';
    }

    getAttribute(element, selector, attribute) {
        // Handle namespaced elements like podcast:chapters
        const el = element.querySelector(selector);
        if (!el) {
            // Try alternative selectors for namespaced elements
            const alternativeSelectors = [
                selector.replace('podcast\\:', ''),
                selector.replace('podcast\\:', 'podcast:'),
            ];
            
            // Only add local-name selector if we have a namespace
            if (selector.includes('\\:')) {
                const localName = selector.split('\\:')[1];
                alternativeSelectors.push(`*[local-name()="${localName}"]`);
            }
            
            for (const altSelector of alternativeSelectors) {
                const altEl = element.querySelector(altSelector);
                if (altEl) {
                    console.log('Found element with alternative selector:', altSelector);
                    return altEl.getAttribute(attribute);
                }
            }
            return '';
        }
        return el.getAttribute(attribute);
    }

    extractPersons(item) {
        const persons = item.querySelectorAll('podcast\\:person, person');
        return Array.from(persons).map(person => ({
            name: person.textContent.trim(),
            href: person.getAttribute('href') || '',
            img: person.getAttribute('img') || '',
            group: person.getAttribute('group') || '',
            role: person.getAttribute('role') || ''
        }));
    }

    extractValueInfo(item) {
        const value = item.querySelector('value');
        if (!value) return null;

        const recipients = value.querySelectorAll('valueRecipient');
        const timeSplits = value.querySelectorAll('valueTimeSplit');
        
        return {
            type: value.getAttribute('type') || '',
            method: value.getAttribute('method') || '',
            suggested: value.getAttribute('suggested') || '',
            recipients: Array.from(recipients).map(recipient => ({
                name: recipient.getAttribute('name') || '',
                type: recipient.getAttribute('type') || '',
                address: recipient.getAttribute('address') || '',
                split: recipient.getAttribute('split') || '',
                itemGuid: recipient.getAttribute('itemGuid') || ''
            })),
            timeSplits: Array.from(timeSplits).map(split => ({
                startTime: split.getAttribute('startTime') || '',
                remotePercentage: split.getAttribute('remotePercentage') || '',
                duration: split.getAttribute('duration') || '',
                remoteItem: (() => {
                    const remoteItem = split.querySelector('remoteItem');
                    return remoteItem ? {
                        feedGuid: remoteItem.getAttribute('feedGuid') || '',
                        itemGuid: remoteItem.getAttribute('itemGuid') || ''
                    } : null;
                })()
            }))
        };
    }

    extractTracks(item) {
        const description = this.getTextContent(item, 'description');
        const tracks = [];
        
        // Extract track information from description
        const trackMatches = description.match(/<a href='([^']+)'>([^<]+)<\/a>/g);
        if (trackMatches) {
            trackMatches.forEach(match => {
                const hrefMatch = match.match(/href='([^']+)'/);
                const textMatch = match.match(/>([^<]+)</);
                if (hrefMatch && textMatch) {
                    const [artist, title] = textMatch[1].split(' - ');
                    tracks.push({
                        url: hrefMatch[1],
                        artist: artist || 'Unknown',
                        title: title || textMatch[1]
                    });
                }
            });
        }
        
        return tracks;
    }

    displayFeedData() {
        if (!this.feedData) return;

        // Update stats
        this.updateStats();
        
        // Display episodes
        this.displayEpisodes();
        
        // Display live items
        this.displayLiveItems();
        
        // Display Podcast Index information
        this.displayPodcastIndexInfo();
    }

    updateStats() {
        const { episodes, liveItems, channel } = this.feedData;
        
        document.getElementById('episodeCount').textContent = episodes.length;
        document.getElementById('lastUpdated').textContent = this.formatDate(channel.lastBuildDate);
        document.getElementById('liveItems').textContent = liveItems.length;
        
        // Calculate total duration
        const totalDuration = episodes.reduce((total, episode) => {
            const duration = this.parseDuration(episode.duration);
            return total + duration;
        }, 0);
        
        document.getElementById('totalDuration').textContent = this.formatDuration(totalDuration);
    }

    displayEpisodes() {
        const container = document.getElementById('episodesContainer');
        const { episodes } = this.feedData;
        
        if (episodes.length === 0) {
            container.innerHTML = '<div class="placeholder">No episodes found</div>';
            return;
        }

        const episodesHtml = episodes.map((episode, index) => {
            const episodeNumber = this.extractEpisodeNumber(episode.title);
            const duration = this.formatDuration(this.parseDuration(episode.duration));
            const fileSize = episode.enclosure.length ? this.formatFileSize(episode.enclosure.length) : 'Unknown';
            
            const tracksHtml = episode.tracks.length > 0 ? `
                <div class="episode-tracks">
                    <div class="tracks-title">Tracks:</div>
                    ${episode.tracks.map(track => `
                        <div class="track-item">
                            <span class="track-artist">${track.artist}</span>
                            <span class="track-title">- ${track.title}</span>
                        </div>
                    `).join('')}
                </div>
            ` : '';

            const chaptersHtml = episode.chapters ? `
                <div class="episode-chapters">
                    <div class="chapters-title">Chapters:</div>
                    <div class="chapters-loading">Loading chapters from: ${episode.chapters}</div>
                </div>
            ` : '';

            return `
                <div class="episode-card collapsed" data-episode="${index}">
                    <div class="episode-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <div class="episode-title">${episode.title}</div>
                        <div class="episode-badges">
                            ${episodeNumber ? `<div class="episode-number">#${episodeNumber}</div>` : ''}
                            ${episode.chapters ? '<div class="episode-badge chapters-badge">📖 Chapters</div>' : ''}
                            ${episode.value ? '<div class="episode-badge value-badge">💰 V4V</div>' : ''}
                            <span class="toggle-icon">▼</span>
                        </div>
                    </div>
                    <div class="episode-content">
                        <div class="episode-details">
                        <div class="detail-item">
                            <div class="detail-label">Duration</div>
                            <div class="detail-value">${duration}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">File Size</div>
                            <div class="detail-value">${fileSize}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Published</div>
                            <div class="detail-value">${this.formatDate(episode.pubDate)}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">GUID</div>
                            <div class="detail-value">${episode.guid.substring(0, 20)}...</div>
                        </div>
                                            </div>
                        ${episode.value ? `
                            <div class="episode-value">
                                <div class="value-title">💰 Value4Value (V4V)</div>
                                <div class="value-details">
                                    <div class="value-type">Type: ${episode.value.type}</div>
                                    <div class="value-method">Method: ${episode.value.method}</div>
                                    ${episode.value.suggested ? `<div class="value-suggested">Suggested: ${episode.value.suggested} sats</div>` : ''}
                                </div>
                                ${episode.value.recipients && episode.value.recipients.length > 0 ? `
                                    <div class="value-recipients">
                                        <div class="recipients-title">Recipients:</div>
                                        ${episode.value.recipients.map(recipient => `
                                            <div class="recipient-item">
                                                <div class="recipient-name">${recipient.name || 'Unknown'}</div>
                                                <div class="recipient-details">
                                                    <span class="recipient-type">${recipient.type || 'node'}</span>
                                                    ${recipient.split ? `<span class="recipient-split">Split: ${recipient.split}%</span>` : ''}
                                                </div>
                                                ${recipient.address ? `<div class="recipient-address"><a href="https://amboss.space/node/${recipient.address}" target="_blank">${recipient.address}</a></div>` : ''}
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                                                <div class="episode-media-info">
                            <div class="media-content">
                                <div class="media-header">Media Info:</div>
                                ${(() => {
                                    if (episode.value && episode.value.timeSplits && episode.value.timeSplits.length > 0) {
                                        console.log('Generating time splits HTML for episode:', episode.title, 'Time splits:', episode.value.timeSplits.length);
                                        return `
                                            <div class="time-splits-summary">
                                                <span class="summary-label">V4V Splits:</span> ${episode.value.timeSplits.length} time periods
                                            </div>
                                        `;
                                    } else {
                                        return '';
                                    }
                                })()}
                                <div class="chapters-loading">Loading chapters...</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = episodesHtml;
        
        // Load chapters for episodes that have them
        episodes.forEach((episode, index) => {
            console.log(`Episode ${index + 1} chapters:`, episode.chapters);
            if (episode.chapters) {
                this.loadChapters(episode.chapters, index);
            }
        });
    }

    async loadChapters(chaptersUrl, episodeIndex) {
        try {
            const response = await fetch(chaptersUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const chaptersData = await response.json();
            this.displayChapters(chaptersData, episodeIndex);
            
        } catch (error) {
            console.error('Error loading chapters:', error);
            this.displayChaptersError(episodeIndex);
        }
    }

    displayChapters(chaptersData, episodeIndex) {
        const chaptersContainer = document.querySelector(`[data-episode="${episodeIndex}"] .chapters-loading`);
        if (!chaptersContainer) return;

        if (!chaptersData.chapters || chaptersData.chapters.length === 0) {
            chaptersContainer.innerHTML = '<div class="no-chapters">No chapters available</div>';
            return;
        }

        const chaptersHtml = chaptersData.chapters.map((chapter, index) => {
            const startTime = this.formatTime(chapter.startTime);
            
            // Calculate end time: use next chapter's start time, or if it's the last chapter, use a reasonable duration
            let endTime = '';
            if (index < chaptersData.chapters.length - 1) {
                // Use next chapter's start time as this chapter's end time
                endTime = this.formatTime(chaptersData.chapters[index + 1].startTime);
            } else {
                // For the last chapter, add 5 minutes as a reasonable duration
                endTime = this.formatTime(chapter.startTime + 300);
            }
            
            return `
                <div class="chapter-item">
                    <div class="chapter-time">${startTime} - ${endTime}</div>
                    <div class="chapter-title">${chapter.title}</div>
                    ${chapter.url ? `<div class="chapter-url"><a href="${chapter.url}" target="_blank">Link</a></div>` : ''}
                    ${chapter.image ? `<div class="chapter-image"><img src="${chapter.image}" alt="Chapter image" /></div>` : ''}
                </div>
            `;
        }).join('');

        chaptersContainer.innerHTML = chaptersHtml;
    }

    displayChaptersError(episodeIndex) {
        const chaptersContainer = document.querySelector(`[data-episode="${episodeIndex}"] .chapters-loading`);
        if (chaptersContainer) {
            chaptersContainer.innerHTML = '<div class="chapters-error">Failed to load chapters</div>';
        }
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    displayLiveItems() {
        const container = document.getElementById('episodesContainer');
        const { liveItems } = this.feedData;
        
        if (liveItems.length === 0) return;

        const liveItemsHtml = liveItems.map(liveItem => {
            const startDate = this.formatDate(liveItem.start);
            const endDate = this.formatDate(liveItem.end);
            
            return `
                <div class="live-item">
                    <h3>
                        <span class="live-badge">🔴 LIVE</span>
                        ${liveItem.title}
                    </h3>
                    <div class="live-details">
                        <div class="detail-item">
                            <div class="detail-label">Status</div>
                            <div class="detail-value">${liveItem.status}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Start</div>
                            <div class="detail-value">${startDate}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">End</div>
                            <div class="detail-value">${endDate}</div>
                        </div>
                        ${liveItem.chat ? `
                            <div class="detail-item">
                                <div class="detail-label">Chat</div>
                                <div class="detail-value">
                                    <a href="${liveItem.chat}" target="_blank" style="color: white;">Join Chat</a>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Insert live items at the top
        const episodesContainer = document.getElementById('episodesContainer');
        if (episodesContainer.firstChild) {
            episodesContainer.insertAdjacentHTML('afterbegin', liveItemsHtml);
        }
    }

    validateFeed() {
        const container = document.getElementById('validationContainer');
        const validations = [];
        
        if (!this.feedData) return;

        const { channel, episodes, liveItems } = this.feedData;

        // Basic RSS validation
        validations.push(...this.validateBasicRSS(channel, episodes, liveItems));
        
        // Podcast Index specific validations
        validations.push(...this.validatePodcastIndex(channel, episodes, liveItems));
        
        // Value4Value validation
        validations.push(...this.validateValue4Value(channel, episodes, liveItems));
        
        // Live item validation
        validations.push(...this.validateLiveItems(liveItems));
        
        // Episode consistency validation
        validations.push(...this.validateEpisodeConsistency(episodes));

        // Display validations
        if (validations.length === 0) {
            container.innerHTML = '<div class="validation-item success"><span class="validation-icon">✅</span><div class="validation-title">All Good!</div><div class="validation-message">No validation issues found</div></div>';
        } else {
            const validationsHtml = validations.map(validation => `
                <div class="validation-item ${validation.type}">
                    <span class="validation-icon">${this.getValidationIcon(validation.type)}</span>
                    <div class="validation-title">${validation.title}</div>
                    <div class="validation-message">${validation.message}</div>
                </div>
            `).join('');
            
            container.innerHTML = validationsHtml;
        }
    }

    validateBasicRSS(channel, episodes, liveItems) {
        const validations = [];

        // Check required channel elements
        if (!channel.title) validations.push({ type: 'error', title: 'Missing Channel Title', message: 'Channel title is required for RSS compliance' });
        if (!channel.description) validations.push({ type: 'warning', title: 'Missing Channel Description', message: 'Channel description is recommended for podcast discovery' });
        if (!channel.language) validations.push({ type: 'warning', title: 'Missing Language', message: 'Language specification helps with international distribution' });
        if (!channel.link) validations.push({ type: 'error', title: 'Missing Channel Link', message: 'Channel link is required for RSS compliance' });

        // Check episodes
        episodes.forEach((episode, index) => {
            if (!episode.title) validations.push({ type: 'error', title: `Episode ${index + 1}: Missing Title`, message: 'Episode title is required for RSS compliance' });
            if (!episode.guid) validations.push({ type: 'error', title: `Episode ${index + 1}: Missing GUID`, message: 'Episode GUID is required for Podcast Index aggregation' });
            if (!episode.enclosure.url) validations.push({ type: 'error', title: `Episode ${index + 1}: Missing Audio File`, message: 'Episode audio file URL is required for playback' });
            if (!episode.pubDate) validations.push({ type: 'warning', title: `Episode ${index + 1}: Missing Publication Date`, message: 'Publication date helps with chronological ordering' });
            
            // Check for duplicate GUIDs
            const duplicateGuid = episodes.findIndex((ep, i) => ep.guid === episode.guid && i !== index);
            if (duplicateGuid !== -1) validations.push({ type: 'error', title: `Episode ${index + 1}: Duplicate GUID`, message: `GUID matches episode ${duplicateGuid + 1} - this breaks Podcast Index aggregation` });
        });

        // Check file sizes and durations
        episodes.forEach((episode, index) => {
            if (episode.enclosure.length && episode.enclosure.length < 1000) {
                validations.push({ type: 'warning', title: `Episode ${index + 1}: Small File Size`, message: `File size (${episode.enclosure.length} bytes) seems unusually small for audio content` });
            }
        });

        return validations;
    }

    validatePodcastIndex(channel, episodes, liveItems) {
        const validations = [];

        // Check podcast namespace elements
        if (!channel.guid) validations.push({ type: 'warning', title: 'Missing Podcast GUID', message: 'podcast:guid is recommended for Podcast Index identification' });
        if (!channel.medium) validations.push({ type: 'warning', title: 'Missing Podcast Medium', message: 'podcast:medium helps categorize your content type' });
        
        // Check for proper podcast namespace usage
        if (channel.complete === 'yes' && episodes.length > 0) {
            validations.push({ type: 'warning', title: 'Podcast Marked Complete', message: 'podcast:complete is set to "yes" but episodes exist - this may indicate the podcast is finished' });
        }

        // Validate episode podcast namespace elements
        episodes.forEach((episode, index) => {
            // Check for chapters support
            if (!episode.chapters) {
                validations.push({ type: 'info', title: `Episode ${index + 1}: No Chapters`, message: 'Consider adding podcast:chapters for better user experience' });
            }

            // Check for person tags
            if (!episode.persons || episode.persons.length === 0) {
                validations.push({ type: 'info', title: `Episode ${index + 1}: No Person Tags`, message: 'Consider adding podcast:person tags for host/guest identification' });
            }

            // Check for value4value support
            if (!episode.value) {
                validations.push({ type: 'info', title: `Episode ${index + 1}: No Value4Value`, message: 'Consider adding podcast:value for Lightning Network payments' });
            }
        });

        return validations;
    }

    validateValue4Value(channel, episodes, liveItems) {
        const validations = [];

        // Check channel-level value4value
        if (channel.value) {
            validations.push(...this.validateValueRecipients(channel.value, 'Channel'));
        }

        // Check episode-level value4value
        episodes.forEach((episode, index) => {
            if (episode.value) {
                validations.push(...this.validateValueRecipients(episode.value, `Episode ${index + 1}`));
            }
        });

        // Check live item value4value
        liveItems.forEach((liveItem, index) => {
            if (liveItem.value) {
                validations.push(...this.validateValueRecipients(liveItem.value, `Live Item ${index + 1}`));
            }
        });

        return validations;
    }

    validateValueRecipients(value, context) {
        const validations = [];

        // Check if value type is specified
        if (!value.type) {
            validations.push({ type: 'warning', title: `${context}: Missing Value Type`, message: 'podcast:value should specify type (e.g., "lightning")' });
        }

        // Check if method is specified
        if (!value.method) {
            validations.push({ type: 'warning', title: `${context}: Missing Value Method`, message: 'podcast:value should specify method (e.g., "keysend")' });
        }

        // Validate recipients
        if (!value.recipients || value.recipients.length === 0) {
            validations.push({ type: 'error', title: `${context}: No Value Recipients`, message: 'podcast:value must have at least one recipient' });
            return validations;
        }

        // Check recipient splits add up to 100%
        const totalSplit = value.recipients.reduce((sum, recipient) => {
            const split = parseFloat(recipient.split) || 0;
            return sum + split;
        }, 0);

        if (Math.abs(totalSplit - 100) > 0.01) {
            validations.push({ type: 'warning', title: `${context}: Split Total`, message: `Recipient splits total ${totalSplit}% (should be 100%)` });
        }

        // Validate individual recipients
        value.recipients.forEach((recipient, index) => {
            if (!recipient.name) {
                validations.push({ type: 'warning', title: `${context}: Recipient ${index + 1}`, message: 'Recipient name is recommended for identification' });
            }

            if (!recipient.address) {
                validations.push({ type: 'error', title: `${context}: Recipient ${index + 1}`, message: 'Lightning Network address is required' });
            } else {
                // Basic Lightning address validation (starts with 02, 03, or 05)
                if (!recipient.address.match(/^0[235][0-9a-fA-F]{64}$/)) {
                    validations.push({ type: 'warning', title: `${context}: Recipient ${index + 1}`, message: 'Lightning address format may be invalid' });
                }
            }

            if (!recipient.split) {
                validations.push({ type: 'warning', title: `${context}: Recipient ${index + 1}`, message: 'Split percentage is recommended' });
            }
        });

        return validations;
    }

    validateLiveItems(liveItems) {
        const validations = [];

        liveItems.forEach((liveItem, index) => {
            if (!liveItem.title) validations.push({ type: 'error', title: `Live Item ${index + 1}: Missing Title`, message: 'Live item title is required for Podcast Index' });
            if (!liveItem.start) validations.push({ type: 'error', title: `Live Item ${index + 1}: Missing Start Time`, message: 'Live item start time is required for scheduling' });
            
            // Check if end time is after start time
            if (liveItem.start && liveItem.end) {
                const startTime = new Date(liveItem.start);
                const endTime = new Date(liveItem.end);
                if (endTime <= startTime) {
                    validations.push({ type: 'error', title: `Live Item ${index + 1}: Invalid Time Range`, message: 'End time must be after start time' });
                }
            }

            // Check for streaming URL
            if (!liveItem.enclosure.url) {
                validations.push({ type: 'warning', title: `Live Item ${index + 1}: No Stream URL`, message: 'Consider adding a streaming URL for live listeners' });
            }

            // Check for chat room
            if (!liveItem.chat) {
                validations.push({ type: 'info', title: `Live Item ${index + 1}: No Chat Room`, message: 'Consider adding a chat room URL for live interaction' });
            }
        });

        return validations;
    }

    validateEpisodeConsistency(episodes) {
        const validations = [];

        // Check for episode numbering consistency
        const episodeNumbers = episodes.map(ep => this.extractEpisodeNumber(ep.title)).filter(num => num !== null);
        if (episodeNumbers.length > 0) {
            const sortedNumbers = [...episodeNumbers].sort((a, b) => a - b);
            if (JSON.stringify(episodeNumbers) !== JSON.stringify(sortedNumbers)) {
                validations.push({ type: 'warning', title: 'Episode Numbering', message: 'Episode numbers are not in chronological order - this may confuse listeners' });
            }

            // Check for missing episode numbers
            const maxNumber = Math.max(...episodeNumbers);
            const missingNumbers = [];
            for (let i = 1; i <= maxNumber; i++) {
                if (!episodeNumbers.includes(i)) {
                    missingNumbers.push(i);
                }
            }
            if (missingNumbers.length > 0) {
                validations.push({ type: 'info', title: 'Episode Numbering', message: `Missing episode numbers: ${missingNumbers.join(', ')}` });
            }
        }

        // Check for consistent metadata
        const hasChapters = episodes.filter(ep => ep.chapters).length;
        const hasPersons = episodes.filter(ep => ep.persons && ep.persons.length > 0).length;
        const hasValue = episodes.filter(ep => ep.value).length;

        if (hasChapters > 0 && hasChapters < episodes.length) {
            validations.push({ type: 'warning', title: 'Inconsistent Chapters', message: `${hasChapters}/${episodes.length} episodes have chapters - consider adding to all episodes` });
        }

        if (hasPersons > 0 && hasPersons < episodes.length) {
            validations.push({ type: 'warning', title: 'Inconsistent Person Tags', message: `${hasPersons}/${episodes.length} episodes have person tags - consider adding to all episodes` });
        }

        if (hasValue > 0 && hasValue < episodes.length) {
            validations.push({ type: 'warning', title: 'Inconsistent Value4Value', message: `${hasValue}/${episodes.length} episodes have value4value - consider adding to all episodes` });
        }

        return validations;
    }

    getValidationIcon(type) {
        switch (type) {
            case 'success': return '✅';
            case 'warning': return '⚠️';
            case 'error': return '❌';
            case 'info': return 'ℹ️';
            default: return 'ℹ️';
        }
    }

    extractEpisodeNumber(title) {
        const match = title.match(/Episode\s+(\d+)/i);
        return match ? parseInt(match[1]) : null;
    }

    parseDuration(duration) {
        if (!duration) return 0;
        
        // Handle various duration formats
        if (typeof duration === 'string') {
            // Format: "1:23:45" or "23:45" or "45"
            const parts = duration.split(':').map(Number);
            if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
                return parts[0] * 60 + parts[1];
            } else if (parts.length === 1) {
                return parts[0];
            }
        }
        
        return parseInt(duration) || 0;
    }

    formatDuration(seconds) {
        if (seconds === 0) return 'Unknown';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    formatFileSize(bytes) {
        if (!bytes) return 'Unknown';
        
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Invalid Date';
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch (error) {
            return 'Invalid Date';
        }
    }

    updateStatus(type, message) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
    }

    clearData() {
        this.feedData = null;
        document.getElementById('episodesContainer').innerHTML = '<div class="placeholder">Click "Fetch Feed" to load episodes</div>';
        document.getElementById('episodeCount').textContent = '-';
        document.getElementById('lastUpdated').textContent = '-';
        document.getElementById('liveItems').textContent = '-';
        document.getElementById('totalDuration').textContent = '-';
        this.updateStatus('', '');
        
        // Clear Podcast Index info
        document.getElementById('podcastIndexContainer').innerHTML = '<div class="placeholder">Podcast Index information will appear here</div>';
    }

    displayPodcastIndexInfo() {
        const container = document.getElementById('podcastIndexContainer');
        if (!this.feedData) return;

        const { channel, episodes, liveItems } = this.feedData;
        
        const info = [];

        // Podcast namespace compliance
        if (channel.guid) info.push({ label: 'Podcast GUID', value: channel.guid, status: 'present' });
        else info.push({ label: 'Podcast GUID', value: 'Missing', status: 'missing' });

        if (channel.medium) info.push({ label: 'Podcast Medium', value: channel.medium, status: 'present' });
        else info.push({ label: 'Podcast Medium', value: 'Missing', status: 'missing' });

        if (channel.complete) info.push({ label: 'Podcast Complete', value: channel.complete, status: 'present' });
        else info.push({ label: 'Podcast Complete', value: 'Not specified', status: 'missing' });

        if (channel.block) info.push({ label: 'Podcast Blocked', value: channel.block, status: 'present' });
        else info.push({ label: 'Podcast Blocked', value: 'Not specified', status: 'missing' });

        // Value4Value support
        const hasChannelValue = channel.value ? 'Yes' : 'No';
        info.push({ label: 'Channel Value4Value', value: hasChannelValue, status: channel.value ? 'present' : 'missing' });

        const episodesWithValue = episodes.filter(ep => ep.value).length;
        info.push({ label: 'Episodes with Value4Value', value: `${episodesWithValue}/${episodes.length}`, status: episodesWithValue > 0 ? 'present' : 'missing' });

        // Live streaming support
        info.push({ label: 'Live Items', value: liveItems.length, status: liveItems.length > 0 ? 'present' : 'missing' });

        // Enhanced features
        const episodesWithChapters = episodes.filter(ep => ep.chapters).length;
        console.log('Episodes with chapters:', episodesWithChapters, 'Total episodes:', episodes.length);
        console.log('Episodes with chapters:', episodes.filter(ep => ep.chapters).map(ep => ep.title));
        info.push({ label: 'Episodes with Chapters', value: `${episodesWithChapters}/${episodes.length}`, status: episodesWithChapters > 0 ? 'present' : 'missing' });

        const episodesWithPersons = episodes.filter(ep => ep.persons && ep.persons.length > 0).length;
        info.push({ label: 'Episodes with Person Tags', value: `${episodesWithPersons}/${episodes.length}`, status: episodesWithPersons > 0 ? 'present' : 'missing' });

        // Chapters summary
        if (episodesWithChapters > 0) {
            const chapterEpisodes = episodes.filter(ep => ep.chapters).map(ep => {
                const episodeNumber = this.extractEpisodeNumber(ep.title);
                return episodeNumber || ep.title;
            }).slice(0, 10); // Show first 10
            info.push({ label: 'Chapter Episodes', value: chapterEpisodes.join(', '), status: 'present' });
        }

        // Podcast Index readiness score
        const score = this.calculatePodcastIndexScore(channel, episodes, liveItems);
        info.push({ label: 'Podcast Index Score', value: `${score}/100`, status: score >= 80 ? 'present' : score >= 60 ? 'warning' : 'missing' });

        const infoHtml = info.map(item => `
            <div class="info-item ${item.status}">
                <div class="info-label">${item.label}</div>
                <div class="info-value">${item.value}</div>
            </div>
        `).join('');

        container.innerHTML = infoHtml;
    }

    calculatePodcastIndexScore(channel, episodes, liveItems) {
        let score = 0;
        const maxScore = 100;

        // Channel level (20 points)
        if (channel.guid) score += 10;
        if (channel.medium) score += 5;
        if (channel.complete !== undefined) score += 5;

        // Episodes level (50 points)
        if (episodes.length > 0) score += 10;
        
        const episodesWithValue = episodes.filter(ep => ep.value).length;
        if (episodesWithValue > 0) score += 10;
        if (episodesWithValue === episodes.length) score += 5;

        const episodesWithChapters = episodes.filter(ep => ep.chapters).length;
        if (episodesWithChapters > 0) score += 10;
        if (episodesWithChapters === episodes.length) score += 5;

        const episodesWithPersons = episodes.filter(ep => ep.persons && ep.persons.length > 0).length;
        if (episodesWithChapters > 0) score += 10;

        // Live streaming (20 points)
        if (liveItems.length > 0) score += 20;

        // Value4Value support (10 points)
        if (channel.value) score += 10;

        return Math.min(score, maxScore);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing HGHFeedChecker');
    const checker = new HGHFeedChecker();
    console.log('HGHFeedChecker initialized:', checker);
});
