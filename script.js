class HGHFeedChecker {
    constructor() {
        this.feedUrl = null;  // Now dynamic - read from input
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
        // Read URL from input field
        const urlInput = document.getElementById('feedUrl');
        this.feedUrl = urlInput?.value?.trim();

        // Validate URL is provided
        if (!this.feedUrl) {
            this.updateStatus('error', 'Please enter a feed URL');
            return;
        }

        // Validate URL format
        try {
            new URL(this.feedUrl);
        } catch {
            this.updateStatus('error', 'Invalid URL format');
            return;
        }

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
                // Use local proxy server first, then fallback to external proxies
                const proxyServices = [
                    `/api/proxy?url=${encodeURIComponent(this.feedUrl)}`,
                    `https://api.allorigins.win/raw?url=${encodeURIComponent(this.feedUrl)}`
                ];
                
                let proxyWorked = false;
                for (const proxyUrl of proxyServices) {
                    try {
                        console.log('Trying proxy:', proxyUrl);
                        response = await fetch(proxyUrl);
                        if (response.ok) {
                            console.log('Proxy fetch successful');
                            proxyWorked = true;
                            break;
                        }
                    } catch (proxyError) {
                        console.log('Proxy failed:', proxyError.message);
                        continue;
                    }
                }
                
                if (!proxyWorked) {
                    throw new Error('All proxy services failed');
                }
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
        // Try both namespaced and non-namespaced selectors for remote feeds
        const value = item.querySelector('podcast\\:value, value');
        if (!value) {
            console.log('🔍 No V4V value element found in item');
            return null;
        }

        console.log('🔍 Found V4V value element:', value.tagName, 'with attributes:', {
            type: value.getAttribute('type'),
            method: value.getAttribute('method'),
            suggested: value.getAttribute('suggested')
        });

        const recipients = value.querySelectorAll('podcast\\:valueRecipient, valueRecipient');
        const timeSplits = value.querySelectorAll('podcast\\:valueTimeSplit, valueTimeSplit');
        
        console.log('🔍 Processing main V4V for episode:', {
            recipients: recipients.length,
            timeSplits: timeSplits.length,
            totalRemoteItems: Array.from(timeSplits).filter(split => split.querySelector('remoteItem')).length
        });
        
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
                    if (!remoteItem) return null;
                    
                    const feedGuid = remoteItem.getAttribute('feedGuid') || '';
                    const itemGuid = remoteItem.getAttribute('itemGuid') || '';
                    console.log('🔍 Processing remoteItem:', { feedGuid: feedGuid.substring(0, 8), itemGuid: itemGuid.substring(0, 8) });
                    
                    // Check if this remote item has its own V4V splits
                    const remoteValue = remoteItem.querySelector('podcast\\:value, value');
                    let remoteV4V = null;
                    
                    if (remoteValue) {
                        console.log('📊 Found podcast:value in remoteItem!', { feedGuid: feedGuid.substring(0, 8), itemGuid: itemGuid.substring(0, 8) });
                        console.log('📊 Remote value attributes:', {
                            type: remoteValue.getAttribute('type'),
                            method: remoteValue.getAttribute('method'),
                            suggested: remoteValue.getAttribute('suggested')
                        });
                        
                        const remoteTimeSplits = Array.from(remoteValue.querySelectorAll('podcast\\:timeSplit, timeSplit')).map(timeSplit => ({
                            startTime: timeSplit.getAttribute('startTime') || '',
                            duration: timeSplit.getAttribute('duration') || '',
                            remotePercentage: timeSplit.getAttribute('remotePercentage') || '',
                            remoteItem: (() => {
                                const nestedRemote = timeSplit.querySelector('remoteItem');
                                return nestedRemote ? {
                                    feedGuid: nestedRemote.getAttribute('feedGuid') || '',
                                    itemGuid: nestedRemote.getAttribute('itemGuid') || ''
                                } : null;
                            })()
                        }));
                        
                        console.log('📊 Remote timeSplits found:', remoteTimeSplits.length);
                        if (remoteTimeSplits.length > 0) {
                            console.log('📊 Remote timeSplits details:', remoteTimeSplits);
                            remoteV4V = {
                                type: remoteValue.getAttribute('type') || 'lightning',
                                method: remoteValue.getAttribute('method') || 'keysend',
                                suggested: remoteValue.getAttribute('suggested') || '',
                                timeSplits: remoteTimeSplits
                            };
                            console.log('✅ Successfully created nested V4V data for remoteItem!');
                        }
                    } else {
                        console.log('❌ No podcast:value found in remoteItem', { feedGuid: feedGuid.substring(0, 8), itemGuid: itemGuid.substring(0, 8) });
                    }
                    
                    return {
                        feedGuid: feedGuid,
                        itemGuid: itemGuid,
                        value: remoteV4V
                    };
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

        // Run V4V validation for all episodes
        const allErrors = [];
        const allWarnings = [];

        this.feedData.episodes.forEach((episode, index) => {
            // Validate V4V for songs (remote items only)
            const v4vResult = this.validateSongV4V(episode, index);
            allErrors.push(...v4vResult.errors);
            allWarnings.push(...v4vResult.warnings);

            // Check if episode has chapters
            if (!episode.chapters) {
                allWarnings.push(`Episode ${index + 1}: No chapters URL found`);
            }
        });

        // Display validation results (errors first)
        this.displayValidationResults(allErrors, allWarnings);

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

    getEpisodeErrors(episode) {
        const errors = [];
        const warnings = [];

        // Check for chapters
        if (!episode.chapters) {
            warnings.push('No chapters file');
        }

        // Check for V4V
        if (!episode.value?.timeSplits || episode.value.timeSplits.length === 0) {
            warnings.push('No V4V time splits');
        } else {
            // Validate song V4V
            const songSplits = episode.value.timeSplits.filter(s => s.remoteItem);
            songSplits.forEach(split => {
                if (!split.remoteItem.feedGuid) {
                    errors.push(`Song at ${this.formatTime(parseFloat(split.startTime))}: Missing feed GUID`);
                }
                if (!split.remoteItem.itemGuid) {
                    errors.push(`Song at ${this.formatTime(parseFloat(split.startTime))}: Missing item GUID`);
                }
            });
        }

        // Check basic episode requirements
        if (!episode.guid) errors.push('Missing episode GUID');
        if (!episode.enclosure) errors.push('Missing audio file');

        return { errors, warnings };
    }

    displayEpisodes() {
        const container = document.getElementById('episodesContainer');
        const { episodes } = this.feedData;

        // Show feed summary
        const feedSummary = document.getElementById('feedSummary');
        if (feedSummary) feedSummary.style.display = 'block';

        if (episodes.length === 0) {
            container.innerHTML = '<div class="placeholder">No episodes found</div>';
            return;
        }

        const episodesHtml = episodes.map((episode, index) => {
            const duration = this.formatDuration(this.parseDuration(episode.duration));
            const hasChapters = !!episode.chapters;
            const hasV4V = !!(episode.value && episode.value.timeSplits && episode.value.timeSplits.length > 0);
            const songCount = hasV4V ? episode.value.timeSplits.filter(s => s.remoteItem).length : 0;

            // Get validation errors for this episode
            const { errors, warnings } = this.getEpisodeErrors(episode);
            const hasIssues = errors.length > 0 || warnings.length > 0;
            const issueCount = errors.length + warnings.length;

            return `
                <div class="episode-card ${hasIssues ? 'has-issues' : ''}" data-episode="${index}">
                    <div class="episode-header" onclick="window.toggleEpisode(this)">
                        <div class="episode-title">${episode.title}</div>
                        <div class="episode-meta">
                            <span class="episode-date">${this.formatDate(episode.pubDate)}</span>
                            <span class="episode-duration">${duration}</span>
                        </div>
                    </div>
                    <div class="episode-badges">
                        ${hasChapters ? '<span class="episode-badge chapters-badge">Chapters</span>' : ''}
                        ${hasV4V ? `<span class="episode-badge value-badge">${songCount} Songs</span>` : ''}
                        ${hasIssues ? `<span class="episode-badge error-badge">${issueCount} Issue${issueCount > 1 ? 's' : ''}</span>` : ''}
                        <span class="expand-btn" onclick="window.toggleEpisode(this.closest('.episode-card').querySelector('.episode-header'))">▼ Details</span>
                    </div>
                    <div class="episode-content collapsed">
                        ${hasIssues ? `
                            <div class="episode-errors">
                                ${errors.map(e => `<div class="episode-error">❌ ${e}</div>`).join('')}
                                ${warnings.map(w => `<div class="episode-warning">⚠️ ${w}</div>`).join('')}
                            </div>
                        ` : ''}
                        ${hasChapters ? `
                            <div class="chapters-section">
                                <div class="chapters-title">Chapters</div>
                                <div class="chapters-loading" data-url="${episode.chapters}">Loading...</div>
                            </div>
                        ` : ''}
                        ${hasV4V ? `
                            <div class="v4v-section">
                                <div class="v4v-title">V4V Time Splits (${episode.value.timeSplits.length})</div>
                                ${episode.value.timeSplits.map(split => split.remoteItem ? `
                                    <div class="song-item">
                                        <span class="song-time">${this.formatTime(parseFloat(split.startTime))}</span>
                                        <span class="song-duration">${this.formatTime(parseFloat(split.duration))}</span>
                                        <span class="song-pct">${split.remotePercentage || 100}%</span>
                                    </div>
                                ` : '').join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = episodesHtml;

        // Load chapters for expanded episodes
        episodes.forEach((episode, index) => {
            if (episode.chapters) {
                this.loadChapters(episode.chapters, index);
            }
        });
    }

    async loadChapters(chaptersUrl, episodeIndex) {
        try {
            let response;

            // Try direct fetch first
            try {
                response = await fetch(chaptersUrl);
                if (!response.ok) throw new Error('Direct fetch failed');
            } catch (directError) {
                console.log('Direct chapters fetch failed, trying CORS proxy:', directError.message);
                // Use proxy for CORS
                const proxyServices = [
                    `/api/proxy?url=${encodeURIComponent(chaptersUrl)}`,
                    `https://api.allorigins.win/raw?url=${encodeURIComponent(chaptersUrl)}`
                ];

                let proxyWorked = false;
                for (const proxyUrl of proxyServices) {
                    try {
                        console.log('Trying chapters proxy:', proxyUrl);
                        response = await fetch(proxyUrl);
                        if (response.ok) {
                            console.log('Chapters proxy fetch successful');
                            proxyWorked = true;
                            break;
                        }
                    } catch (proxyError) {
                        console.log('Chapters proxy failed:', proxyError.message);
                        continue;
                    }
                }

                if (!proxyWorked) {
                    throw new Error('All proxy services failed for chapters');
                }
            }

            const chaptersData = await response.json();
            this.displayChapters(chaptersData, episodeIndex);

            // Validate chapter timing
            const timingErrors = this.validateChapterTiming(chaptersData, episodeIndex);
            if (timingErrors.length > 0) {
                console.warn('Chapter timing issues:', timingErrors);
            }

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

        // Get V4V time splits for this episode to match with chapters
        const episode = this.feedData?.episodes?.[episodeIndex];
        const timeSplits = episode?.value?.timeSplits || [];

        const chaptersHtml = chaptersData.chapters.map((chapter, index) => {
            const startTime = this.formatTime(chapter.startTime);

            // Calculate end time
            let endTime = '';
            let endSeconds = 0;
            if (index < chaptersData.chapters.length - 1) {
                endSeconds = chaptersData.chapters[index + 1].startTime;
                endTime = this.formatTime(endSeconds);
            } else {
                endSeconds = chapter.startTime + 300;
                endTime = this.formatTime(endSeconds);
            }

            // Find matching V4V split for this chapter time range
            const matchingSplit = timeSplits.find(split => {
                const splitStart = parseFloat(split.startTime);
                return splitStart >= chapter.startTime && splitStart < endSeconds;
            });

            const hasDetails = chapter.image || chapter.url || matchingSplit;
            const hasV4V = matchingSplit && matchingSplit.remoteItem;

            return `
                <div class="chapter-item ${hasDetails ? 'expandable' : ''}" onclick="${hasDetails ? 'window.toggleChapter(this)' : ''}">
                    <div class="chapter-header">
                        <div class="chapter-time">${startTime} - ${endTime}</div>
                        <div class="chapter-title">${chapter.title}</div>
                        ${hasV4V ? '<span class="chapter-badge v4v">V4V</span>' : ''}
                        ${chapter.url ? '<span class="chapter-badge has-link">Link</span>' : ''}
                        ${chapter.image ? '<span class="chapter-badge has-art">Art</span>' : ''}
                        ${hasDetails ? '<span class="chapter-expand">▼</span>' : ''}
                    </div>
                    ${hasDetails ? `
                        <div class="chapter-details collapsed">
                            ${chapter.image ? `
                                <div class="chapter-artwork">
                                    <img src="${chapter.image}" alt="${chapter.title}" />
                                </div>
                            ` : ''}
                            ${chapter.url ? `
                                <div class="chapter-link">
                                    <span class="detail-label">Link:</span>
                                    <a href="${chapter.url}" target="_blank">${chapter.url}</a>
                                </div>
                            ` : ''}
                            ${hasV4V ? this.renderChapterV4V(matchingSplit, episode) : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        chaptersContainer.innerHTML = `<div class="chapters-list">${chaptersHtml}</div>`;

        // Update the chapters title to show count
        const chaptersSection = chaptersContainer.closest('.chapters-section');
        if (chaptersSection) {
            const chaptersTitle = chaptersSection.querySelector('.chapters-title');
            if (chaptersTitle) {
                chaptersTitle.textContent = `Chapters (${chaptersData.chapters.length})`;
            }
        }
    }

    renderChapterV4V(split, episode) {
        if (!split || !split.remoteItem) return '';

        const remote = split.remoteItem;
        const remotePercent = parseFloat(split.remotePercentage) || 100;
        const showPercent = 100 - remotePercent;

        let html = `<div class="chapter-v4v" data-feed-guid="${remote.feedGuid || ''}" data-item-guid="${remote.itemGuid || ''}">
            <div class="v4v-header">V4V Payment Breakdown</div>

            <div class="artist-info-container">
                <div class="artist-info-loading">Loading artist info...</div>
            </div>

            <div class="v4v-breakdown">
                <div class="breakdown-section song-section">
                    <div class="breakdown-header">
                        <span class="breakdown-icon">🎵</span>
                        <span class="breakdown-title">Song Artist</span>
                        <span class="breakdown-pct">${remotePercent}%</span>
                    </div>
                    <div class="breakdown-details">
                        <div class="guid-info">
                            <div class="guid-row"><span class="guid-label">Feed:</span> <span class="guid-value">${remote.feedGuid || 'N/A'}</span></div>
                            <div class="guid-row"><span class="guid-label">Item:</span> <span class="guid-value">${remote.itemGuid || 'N/A'}</span></div>
                        </div>
                        ${remote.value?.recipients && remote.value.recipients.length > 0 ? `
                            <div class="nested-splits">
                                <div class="nested-splits-header">Artist Splits (of ${remotePercent}%):</div>
                                ${remote.value.recipients.map(r => {
                                    const actualPct = ((parseFloat(r.split) / 100) * remotePercent).toFixed(1);
                                    return `
                                    <div class="split-row">
                                        <span class="split-name">${r.name || 'Unknown'}</span>
                                        <span class="split-pct">${r.split}%</span>
                                        <span class="split-actual">= ${actualPct}% total</span>
                                    </div>
                                `}).join('')}
                            </div>
                        ` : '<div class="no-splits">No nested splits defined</div>'}
                    </div>
                </div>

                ${showPercent > 0 ? `
                <div class="breakdown-section show-section">
                    <div class="breakdown-header">
                        <span class="breakdown-icon">🎙️</span>
                        <span class="breakdown-title">Show (HGH)</span>
                        <span class="breakdown-pct">${showPercent}%</span>
                    </div>
                    ${episode?.value?.recipients && episode.value.recipients.length > 0 ? `
                        <div class="breakdown-details">
                            <div class="nested-splits">
                                <div class="nested-splits-header">Show Splits (of ${showPercent}%):</div>
                                ${episode.value.recipients.map(r => {
                                    const actualPct = ((parseFloat(r.split) / 100) * showPercent).toFixed(2);
                                    const addressLink = r.address ? `<a href="https://amboss.space/node/${r.address}" target="_blank" class="address-link">${r.address}</a>` : 'No address';
                                    return `
                                    <div class="split-row">
                                        <span class="split-name">${r.name || 'Unknown'}</span>
                                        <span class="split-pct">${r.split}%</span>
                                        <span class="split-actual">= ${actualPct}% total</span>
                                    </div>
                                    <div class="split-address">${addressLink}</div>
                                `}).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                ` : ''}
            </div>
        </div>`;

        return html;
    }

    async loadArtistInfo(container, feedGuid, itemGuid) {
        const infoContainer = container.querySelector('.artist-info-container');
        if (!infoContainer || infoContainer.classList.contains('loaded')) return;

        infoContainer.classList.add('loaded');

        try {
            // Use Podcast Index API to get episode and feed info
            const apiKey = 'CM9M48BRFRTRMUCAWV82';
            const apiSecret = 'WbB4Yx7zFLWbUvCYccb8YsKVeN5Zd2SgS4tEQjet';
            const timestamp = Math.floor(Date.now() / 1000);
            const authString = apiKey + apiSecret + timestamp;
            const authHash = await this.sha1(authString);

            const headers = {
                'User-Agent': 'HGH-Checker/1.0',
                'X-Auth-Key': apiKey,
                'X-Auth-Date': timestamp.toString(),
                'Authorization': authHash
            };

            let songTitle = null;
            let artistName = null;
            let albumArt = null;
            let feedTitle = null;
            let v4vRecipients = [];

            // Try to get episode info first
            try {
                const episodeResponse = await fetch(`https://api.podcastindex.org/api/1.0/episodes/byguid?guid=${encodeURIComponent(itemGuid)}&feedguid=${encodeURIComponent(feedGuid)}`, { headers });
                if (episodeResponse.ok) {
                    const episodeData = await episodeResponse.json();
                    if (episodeData.episode) {
                        songTitle = episodeData.episode.title;
                        albumArt = episodeData.episode.image || episodeData.episode.feedImage;
                        feedTitle = episodeData.episode.feedTitle;
                        // Get V4V from episode if available
                        if (episodeData.episode.value?.destinations) {
                            v4vRecipients = episodeData.episode.value.destinations;
                        }
                    }
                }
            } catch (e) {
                console.log('Episode lookup failed:', e.message);
            }

            // Get feed info for artist name and V4V
            try {
                const feedResponse = await fetch(`https://api.podcastindex.org/api/1.0/podcasts/byguid?guid=${encodeURIComponent(feedGuid)}`, { headers });
                if (feedResponse.ok) {
                    const feedData = await feedResponse.json();
                    if (feedData.feed) {
                        artistName = feedData.feed.author || feedData.feed.title;
                        if (!albumArt) albumArt = feedData.feed.image;
                        if (!feedTitle) feedTitle = feedData.feed.title;
                        // Get V4V from feed if not already from episode
                        if (v4vRecipients.length === 0 && feedData.feed.value?.destinations) {
                            v4vRecipients = feedData.feed.value.destinations;
                        }
                    }
                }
            } catch (e) {
                console.log('Feed lookup failed:', e.message);
            }

            // Build the artist info display
            if (songTitle || artistName || albumArt) {
                infoContainer.innerHTML = `
                    <div class="artist-info">
                        ${albumArt ? `<img src="${albumArt}" alt="Album art" class="artist-artwork" />` : ''}
                        <div class="artist-details">
                            ${songTitle ? `<div class="song-title">${songTitle}</div>` : ''}
                            ${artistName ? `<div class="artist-name">by ${artistName}</div>` : ''}
                            ${feedTitle && feedTitle !== artistName ? `<div class="feed-title">${feedTitle}</div>` : ''}
                        </div>
                    </div>
                `;
            } else {
                infoContainer.innerHTML = '<div class="artist-info-error">Could not load artist info</div>';
            }

            // Update the nested splits section with fetched V4V data
            if (v4vRecipients.length > 0) {
                const splitsContainer = container.querySelector('.no-splits');
                if (splitsContainer) {
                    const remotePercent = 99; // Default, could be parsed from parent
                    splitsContainer.outerHTML = `
                        <div class="nested-splits">
                            <div class="nested-splits-header">Artist Payment Splits:</div>
                            ${v4vRecipients.map(r => {
                                const actualPct = ((parseFloat(r.split) / 100) * remotePercent).toFixed(1);
                                const addressLink = r.address ? `<a href="https://amboss.space/node/${r.address}" target="_blank" class="address-link">${r.address}</a>` : 'No address';
                                return `
                                <div class="split-row">
                                    <span class="split-name">${r.name || 'Unknown'}</span>
                                    <span class="split-pct">${r.split}%</span>
                                    <span class="split-actual">= ${actualPct}% total</span>
                                </div>
                                <div class="split-address">${addressLink}</div>
                            `}).join('')}
                        </div>
                    `;
                }
            }

        } catch (error) {
            console.error('Error loading artist info:', error);
            infoContainer.innerHTML = '<div class="artist-info-error">Could not load artist info</div>';
        }
    }

    async loadRemoteItemArtworkForEpisode(episodeElement) {
        console.log('Loading remote item artwork and V4V data for specific episode...');
        // Find artwork placeholders only within this episode
        const placeholders = episodeElement.querySelectorAll('.artwork-placeholder:not(.loaded)');
        console.log('Found artwork placeholders in episode:', placeholders.length);
        
        for (const placeholder of placeholders) {
            const feedGuid = placeholder.dataset.feedGuid;
            const itemGuid = placeholder.dataset.itemGuid;
            console.log('Loading artwork and V4V data for:', feedGuid, itemGuid);
            
            // Mark as loaded to prevent duplicate loading
            placeholder.classList.add('loaded');
            placeholder.innerHTML = '<span class="artwork-loading">⏳</span>';
            
            try {
                const remoteData = await this.getRemoteItemData(feedGuid, itemGuid);
                console.log('Remote data received:', remoteData);
                
                // Update artwork
                if (remoteData.artworkUrl) {
                    placeholder.innerHTML = `<img src="${remoteData.artworkUrl}" alt="Remote episode artwork" class="remote-artwork-img" />`;
                    console.log('Artwork loaded successfully');
                } else {
                    placeholder.innerHTML = '<span class="artwork-fallback">🎵</span>';
                    console.log('No artwork available, showing fallback');
                }
                
                // Add V4V splits if available (check both recipients and timeSplits)
                if (remoteData.v4vData && 
                    ((remoteData.v4vData.recipients && remoteData.v4vData.recipients.length > 0) || 
                     (remoteData.v4vData.timeSplits && remoteData.v4vData.timeSplits.length > 0))) {
                    console.log('🎯 Adding fetched V4V splits to UI for remote item', {
                        recipients: remoteData.v4vData.recipients ? remoteData.v4vData.recipients.length : 0,
                        timeSplits: remoteData.v4vData.timeSplits ? remoteData.v4vData.timeSplits.length : 0
                    });
                    this.addRemoteV4VSplitsToUI(placeholder, remoteData.v4vData, feedGuid, itemGuid);
                } else if (remoteData.v4vData) {
                    console.log('🔍 Remote V4V data found but no recipients or timeSplits:', remoteData.v4vData);
                }
                
            } catch (error) {
                console.error('Could not load data for remote item:', feedGuid, itemGuid, error);
                placeholder.innerHTML = '<span class="artwork-fallback">🎵</span>';
            }
        }
    }
    
    toggleRemoteDetails(button) {
        const detailsContainer = button.parentElement.nextElementSibling;
        const isExpanding = detailsContainer.classList.contains('collapsed');
        
        // Toggle the collapsed state
        detailsContainer.classList.toggle('collapsed');
        
        // Update button text
        const toggleText = button.querySelector('.toggle-text');
        const toggleIcon = button.querySelector('.toggle-icon');
        if (isExpanding) {
            toggleText.textContent = 'Hide Details';
            toggleIcon.textContent = '▲';
            
            // Load artwork for this episode only when expanding
            const episodeCard = button.closest('.episode-card');
            if (episodeCard) {
                this.loadRemoteItemArtworkForEpisode(episodeCard);
            }
        } else {
            toggleText.textContent = 'Show Details';
            toggleIcon.textContent = '▼';
        }
    }
    
    toggleChapters(button) {
        const chaptersContent = button.closest('.episode-chapters').querySelector('.chapters-content');
        const isExpanding = chaptersContent.classList.contains('collapsed');
        
        // Toggle the collapsed state
        chaptersContent.classList.toggle('collapsed');
        
        // Update button text and handle max-height
        const toggleText = button.querySelector('.toggle-text');
        const toggleIcon = button.querySelector('.toggle-icon');
        if (isExpanding) {
            toggleText.textContent = 'Hide Chapters';
            toggleIcon.textContent = '▲';
            // Set a reasonable max-height for expanded state
            chaptersContent.style.maxHeight = '2000px';
        } else {
            toggleText.textContent = 'Show Chapters';
            toggleIcon.textContent = '▼';
            chaptersContent.style.maxHeight = '0';
        }
    }
    
    toggleNestedSplits(button) {
        const nestedSplitsContent = button.closest('.nested-splits').querySelector('.nested-splits-content');
        const isExpanding = nestedSplitsContent.classList.contains('collapsed');
        
        // Toggle the collapsed state
        nestedSplitsContent.classList.toggle('collapsed');
        
        // Update button text
        const toggleText = button.querySelector('.toggle-text');
        const toggleIcon = button.querySelector('.toggle-icon');
        if (isExpanding) {
            toggleText.textContent = 'Hide Splits';
            toggleIcon.textContent = '▲';
            nestedSplitsContent.style.maxHeight = '1000px';
        } else {
            toggleText.textContent = 'Show Splits';
            toggleIcon.textContent = '▼';
            nestedSplitsContent.style.maxHeight = '0';
        }
    }

    async getRemoteItemData(feedGuid, itemGuid) {
        // This function fetches both artwork and V4V data from remote feeds
        try {
            console.log('Fetching remote item data - Feed GUID:', feedGuid, 'Item GUID:', itemGuid);
            
            const result = await this.getRemoteItemArtwork(feedGuid, itemGuid);
            // getRemoteItemArtwork will be modified to return both artwork and parsed feed
            
            return result;
        } catch (error) {
            console.error('Error fetching remote item data:', error);
            return { artworkUrl: null, v4vData: null };
        }
    }

    async getRemoteItemArtwork(feedGuid, itemGuid) {
        // Artwork priority order:
        // 1. Episode-specific artwork from Podcast Index API (using itemGuid)
        // 2. Episode-specific artwork from RSS feed (matching itemGuid)
        // 3. Channel artwork from RSS feed
        // 4. Channel artwork from Podcast Index API
        // 5. Any episode artwork from RSS feed (fallback)
        
        try {
            console.log('Looking for artwork - Feed GUID:', feedGuid, 'Item GUID:', itemGuid);
            
            // Use Podcast Index API to get the RSS feed URL from the feedGuid
            const apiKey = 'CM9M48BRFRTRMUCAWV82';
            const apiSecret = 'WbB4Yx7zFLWbUvCYccb8YsKVeN5Zd2SgS4tEQjet';
            
            // Generate proper authentication headers for Podcast Index API
            const timestamp = Math.floor(Date.now() / 1000);
            const userAgent = 'HGH-Checker/1.0';
            
            // Create the authorization hash (SHA1 of apiKey + apiSecret + timestamp)
            const authString = apiKey + apiSecret + timestamp;
            const authHash = await this.sha1(authString);
            console.log('Auth details - Key:', apiKey, 'Timestamp:', timestamp, 'Hash length:', authHash.length);
            
            const headers = {
                'User-Agent': userAgent,
                'X-Auth-Key': apiKey,
                'X-Auth-Date': timestamp.toString(),
                'Authorization': authHash
            };
            
            // PRIORITY 1: Try to get episode-specific artwork directly from Podcast Index API using itemGuid
            console.log('First priority: Checking for episode-specific artwork via Podcast Index API...');
            try {
                const episodeResponse = await fetch(`https://api.podcastindex.org/api/1.0/episodes/byguid?guid=${itemGuid}`, { headers });
                
                if (episodeResponse.ok) {
                    const episodeData = await episodeResponse.json();
                    if (episodeData.episodes && episodeData.episodes.length > 0) {
                        const episode = episodeData.episodes[0];
                        if (episode.image) {
                            console.log('Found episode-specific artwork via Podcast Index API (Priority 1):', episode.image);
                            return episode.image;
                        } else {
                            console.log('Episode found but no specific artwork available');
                        }
                    }
                }
            } catch (error) {
                console.log('Podcast Index episode search failed:', error.message);
            }
            
            // Step 1: Look up the feedGuid to get the RSS feed URL
            console.log('Looking up feedGuid to get RSS feed URL:', feedGuid);
            const feedResponse = await fetch(`https://api.podcastindex.org/api/1.0/podcasts/byguid?guid=${feedGuid}`, { headers });
            
            if (!feedResponse.ok) {
                console.log('Failed to get feed details for feedGuid:', feedGuid);
                return null;
            }
            
            const feedData = await feedResponse.json();
            console.log('Feed lookup response:', feedData);
            
            // The byguid endpoint returns a single 'feed' object, not 'feeds' array
            if (!feedData.feed || (Array.isArray(feedData.feed) && feedData.feed.length === 0)) {
                console.log('No feed found for feedGuid:', feedGuid);
                return null;
            }
            
            const remoteFeed = feedData.feed;
            const rssFeedUrl = remoteFeed.url;
            console.log('Found RSS feed URL:', rssFeedUrl);
            
            // Step 2: Fetch the RSS feed directly
            console.log('Fetching RSS feed to extract artwork...');
            let rssText = null;
            
            // Try multiple proxy services for better reliability
            const proxyServices = [
                `/api/proxy?url=${encodeURIComponent(rssFeedUrl)}`,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(rssFeedUrl)}`,
                `https://cors-anywhere.herokuapp.com/${rssFeedUrl}`,
                `https://thingproxy.freeboard.io/fetch/${rssFeedUrl}`
            ];
            
            for (const proxyUrl of proxyServices) {
                try {
                    console.log('Trying proxy service:', proxyUrl);
                    
                    // Create a timeout promise
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Request timeout')), 10000);
                    });
                    
                    // Race between fetch and timeout
                    // allorigins.win doesn't allow User-Agent header, so skip it for that service
                    const headers = proxyUrl.includes('allorigins.win') ? {} : { 'User-Agent': 'HGH-Checker/1.0' };
                    const rssResponse = await Promise.race([
                        fetch(proxyUrl, { headers }),
                        timeoutPromise
                    ]);
                    
                    if (rssResponse.ok) {
                        rssText = await rssResponse.text();
                        console.log('RSS feed fetched successfully via proxy, length:', rssText.length);
                        break;
                    } else {
                        console.log('Proxy service failed:', proxyUrl, 'Status:', rssResponse.status);
                    }
                } catch (error) {
                    console.log('Proxy service error:', proxyUrl, error.message);
                    continue;
                }
            }
            
            // If all proxies failed, try direct fetch (may fail due to CORS)
            if (!rssText) {
                try {
                    console.log('Trying direct fetch as last resort...');
                    
                    // Create a timeout promise for direct fetch too
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Request timeout')), 10000);
                    });
                    
                    const directResponse = await Promise.race([
                        fetch(rssFeedUrl, { 
                            headers: { 'User-Agent': 'HGH-Checker/1.0' }
                        }),
                        timeoutPromise
                    ]);
                    
                    if (directResponse.ok) {
                        rssText = await directResponse.text();
                        console.log('Direct fetch successful, length:', rssText.length);
                    }
                } catch (error) {
                    console.log('Direct fetch also failed:', error.message);
                }
            }
            
            if (!rssText) {
                console.log('All RSS fetch attempts failed');
                
                // Use Podcast Index channel artwork as fallback since we already checked episode artwork
                if (remoteFeed.image) {
                    console.log('Using Podcast Index channel artwork as fallback (RSS fetch failed)');
                    return remoteFeed.image;
                }
                return null;
            }
            
            // Step 3: Parse the RSS feed to extract artwork
            const rssDoc = new DOMParser().parseFromString(rssText, 'text/xml');
            
            // Check if parsing was successful
            if (rssDoc.querySelector('parsererror')) {
                console.log('RSS feed parsing failed, trying alternative parsing...');
                // Try to clean up the XML and parse again
                const cleanedText = rssText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
                const cleanedDoc = new DOMParser().parseFromString(cleanedText, 'text/xml');
                
                if (!cleanedDoc.querySelector('parsererror')) {
                    console.log('Alternative parsing successful');
                    rssDoc = cleanedDoc;
                } else {
                    console.log('Alternative parsing also failed, using Podcast Index fallback');
                    if (remoteFeed.image) {
                        return remoteFeed.image;
                    }
                    return null;
                }
            }
            
            // Look for artwork - PRIORITY 2: Episode-specific artwork from RSS feed
            let artworkUrl = null;
            
            // Try to find the specific episode artwork using itemGuid in the RSS feed
            console.log('Priority 2: Looking for episode-specific artwork in RSS feed...');
            const items = rssDoc.querySelectorAll('item');
            
            for (const item of items) {
                const episodeGuid = item.querySelector('guid');
                if (episodeGuid && episodeGuid.textContent === itemGuid) {
                    // Found the matching episode
                    let itemImage = item.querySelector('itunes\\:image, image');
                    
                    // Try alternative selectors for episode artwork
                    if (!itemImage) {
                        itemImage = item.querySelector('enclosure[type^="image"]') ||
                                  item.querySelector('media\\:content[type^="image"]') ||
                                  item.querySelector('media\\:thumbnail');
                    }
                    
                    if (itemImage) {
                        let imageUrl = itemImage.getAttribute('href') || 
                                     itemImage.getAttribute('url') || 
                                     itemImage.textContent;
                        
                        if (imageUrl) {
                            imageUrl = imageUrl.trim();
                            // Handle relative URLs by making them absolute
                            if (imageUrl.startsWith('/')) {
                                const baseUrl = new URL(rssFeedUrl);
                                imageUrl = `${baseUrl.protocol}//${baseUrl.host}${imageUrl}`;
                            } else if (!imageUrl.startsWith('http')) {
                                const baseUrl = new URL(rssFeedUrl);
                                imageUrl = `${baseUrl.protocol}//${baseUrl.host}/${imageUrl}`;
                            }
                            
                            artworkUrl = imageUrl;
                            console.log('Found episode-specific artwork in RSS (Priority 2):', artworkUrl);
                            break;
                        }
                    }
                }
            }
            
            // PRIORITY 3: Channel artwork as fallback
            if (!artworkUrl) {
                console.log('Priority 3: No episode artwork found, trying channel artwork as fallback...');
                
                // Try to find artwork in the channel - check multiple possible locations
                let channelImage = rssDoc.querySelector('image url, itunes\\:image, image');
                
                // If no image found, try alternative selectors
                if (!channelImage) {
                    channelImage = rssDoc.querySelector('channel > image > url') || 
                                  rssDoc.querySelector('channel > itunes\\:image') ||
                                  rssDoc.querySelector('channel > image') ||
                                  rssDoc.querySelector('rss > channel > image > url');
                }
                
                if (channelImage) {
                    let imageUrl = channelImage.getAttribute('href') || channelImage.textContent;
                    
                    // Clean up the URL if needed
                    if (imageUrl) {
                        imageUrl = imageUrl.trim();
                        // Handle relative URLs by making them absolute
                        if (imageUrl.startsWith('/')) {
                            const baseUrl = new URL(rssFeedUrl);
                            imageUrl = `${baseUrl.protocol}//${baseUrl.host}${imageUrl}`;
                        } else if (!imageUrl.startsWith('http')) {
                            const baseUrl = new URL(rssFeedUrl);
                            imageUrl = `${baseUrl.protocol}//${baseUrl.host}/${imageUrl}`;
                        }
                        
                        artworkUrl = imageUrl;
                        console.log('Found channel artwork (Priority 3):', artworkUrl);
                    }
                }
            }
            
            // PRIORITY 4: Podcast Index channel artwork
            if (!artworkUrl && remoteFeed.image) {
                console.log('Priority 4: Using Podcast Index channel artwork');
                artworkUrl = remoteFeed.image;
            }
            
            // PRIORITY 5: Any episode artwork as last resort
            if (!artworkUrl) {
                console.log('Priority 5: Trying to find any episode artwork as last resort...');
                const items = rssDoc.querySelectorAll('item');
                
                for (const item of items) {
                    const itemImage = item.querySelector('itunes\\:image, image, enclosure[type^="image"]');
                    if (itemImage) {
                        let imageUrl = itemImage.getAttribute('href') || 
                                     itemImage.getAttribute('url') || 
                                     itemImage.textContent;
                        
                        if (imageUrl) {
                            imageUrl = imageUrl.trim();
                            // Handle relative URLs
                            if (imageUrl.startsWith('/')) {
                                const baseUrl = new URL(rssFeedUrl);
                                imageUrl = `${baseUrl.protocol}//${baseUrl.host}${imageUrl}`;
                            } else if (!imageUrl.startsWith('http')) {
                                const baseUrl = new URL(rssFeedUrl);
                                imageUrl = `${baseUrl.protocol}//${baseUrl.host}/${imageUrl}`;
                            }
                            
                            artworkUrl = imageUrl;
                            console.log('Found fallback episode artwork:', artworkUrl);
                            break;
                        }
                    }
                }
            }
            
            console.log('Final artwork URL:', artworkUrl);
            
            // Extract V4V data from the RSS feed for the specific episode
            let v4vData = null;
            const rssItems = rssDoc.querySelectorAll('item');
            console.log(`🔍 Searching for itemGuid "${itemGuid}" in ${rssItems.length} RSS items...`);
            
            for (const item of rssItems) {
                const episodeGuid = item.querySelector('guid');
                const episodeTitle = item.querySelector('title')?.textContent || 'Unknown';
                
                if (episodeGuid) {
                    const guidValue = episodeGuid.textContent.trim();
                    console.log(`📋 Checking episode "${episodeTitle}" with GUID: "${guidValue}"`);
                    
                    if (guidValue === itemGuid) {
                        console.log('🎯 Found matching episode in remote feed, extracting V4V data...');
                        v4vData = this.extractValueInfo(item);
                        if (v4vData) {
                            console.log('✅ Successfully extracted V4V data from remote feed:', {
                                timeSplits: v4vData.timeSplits ? v4vData.timeSplits.length : 0,
                                recipients: v4vData.recipients ? v4vData.recipients.length : 0,
                                v4vData: v4vData
                            });
                        } else {
                            console.log('❌ No V4V data found in matching episode');
                        }
                        break;
                    }
                } else {
                    console.log(`📋 Episode "${episodeTitle}" has no GUID element`);
                }
            }
            
            if (!v4vData) {
                console.log(`❌ No matching episode found for itemGuid: "${itemGuid}"`);
                console.log('Available GUIDs in remote feed:');
                rssItems.forEach((item, index) => {
                    const guid = item.querySelector('guid');
                    const title = item.querySelector('title')?.textContent || 'Unknown';
                    console.log(`  ${index + 1}. "${title}": ${guid ? `"${guid.textContent.trim()}"` : 'NO GUID'}`);
                });
            }
            
            // Validate the artwork URL and prepare return object
            let validatedArtworkUrl = null;
            if (artworkUrl) {
                try {
                    // Check if the URL is valid
                    new URL(artworkUrl);
                    
                    // Try to verify the image is accessible (optional)
                    const imgCheck = new Image();
                    imgCheck.onload = () => console.log('Artwork image verified as accessible');
                    imgCheck.onerror = () => console.log('Artwork image may not be accessible');
                    imgCheck.src = artworkUrl;
                    
                    validatedArtworkUrl = artworkUrl;
                } catch (error) {
                    console.log('Invalid artwork URL:', artworkUrl, error.message);
                    // Try to fix common URL issues
                    if (artworkUrl.startsWith('//')) {
                        const fixedUrl = 'https:' + artworkUrl;
                        console.log('Fixed protocol-relative URL:', fixedUrl);
                        validatedArtworkUrl = fixedUrl;
                    }
                }
            }
            
            return {
                artworkUrl: validatedArtworkUrl,
                v4vData: v4vData
            };
            
        } catch (error) {
            console.error('Error fetching remote item artwork:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                feedGuid,
                itemGuid
            });
            return { artworkUrl: null, v4vData: null };
        }
    }
    
    addRemoteV4VSplitsToUI(placeholder, v4vData, feedGuid, itemGuid) {
        console.log('🔍 addRemoteV4VSplitsToUI called with:', {
            feedGuid: feedGuid?.substring(0, 8),
            itemGuid: itemGuid?.substring(0, 8),
            hasPlaceholder: !!placeholder,
            placeholderClass: placeholder?.className,
            v4vDataKeys: v4vData ? Object.keys(v4vData) : null,
            recipientsCount: v4vData?.recipients?.length || 0,
            timeSplitsCount: v4vData?.timeSplits?.length || 0
        });

        // Find the remote-info div that contains this placeholder
        const remoteItemDetail = placeholder.closest('.remote-item-detail');
        const remoteInfo = remoteItemDetail?.querySelector('.remote-info');
        
        console.log('🔍 DOM elements found:', {
            hasRemoteItemDetail: !!remoteItemDetail,
            hasRemoteInfo: !!remoteInfo,
            placeholderParentClass: placeholder.parentElement?.className,
            placeholderGrandparentClass: placeholder.parentElement?.parentElement?.className
        });

        // Check if we have the required DOM elements and data
        if (!remoteInfo) {
            console.log('❌ Cannot add V4V splits to UI - missing remoteInfo DOM element');
            return;
        }
        
        if (!v4vData) {
            console.log('❌ Cannot add V4V splits to UI - no V4V data');
            return;
        }
        
        // Check if we have either recipients OR timeSplits with actual data
        const hasValidRecipients = v4vData.recipients && v4vData.recipients.length > 0;
        const hasValidTimeSplits = v4vData.timeSplits && v4vData.timeSplits.length > 0;
        
        if (!hasValidRecipients && !hasValidTimeSplits) {
            console.log('❌ Cannot add V4V splits to UI - missing elements or data', {
                hasRemoteInfo: !!remoteInfo,
                hasV4VData: !!v4vData,
                hasRecipients: !!(v4vData?.recipients && v4vData.recipients.length > 0),
                hasTimeSplits: !!(v4vData?.timeSplits && v4vData.timeSplits.length > 0),
                recipientsCount: v4vData?.recipients?.length || 0,
                timeSplitsCount: v4vData?.timeSplits?.length || 0,
                v4vDataStructure: v4vData
            });
            return;
        }
        
        // Determine what type of V4V data we have
        const hasRecipients = v4vData.recipients && v4vData.recipients.length > 0;
        const hasTimeSplits = v4vData.timeSplits && v4vData.timeSplits.length > 0;
        
        console.log('🎯 Adding V4V splits UI for remote item:', {
            feedGuid: feedGuid.substring(0, 8),
            itemGuid: itemGuid.substring(0, 8),
            recipientsCount: hasRecipients ? v4vData.recipients.length : 0,
            timeSplitsCount: hasTimeSplits ? v4vData.timeSplits.length : 0
        });
        
        let splitsContent = '';
        let splitsCount = 0;
        let splitsType = '';
        
        // Handle recipients (basic splits)
        if (hasRecipients) {
            splitsCount = v4vData.recipients.length;
            splitsType = 'recipients';
            splitsContent = v4vData.recipients.map(recipient => `
                <div class="nested-split-item">
                    <div class="recipient-name">${recipient.name || 'Unknown'}</div>
                    <div class="recipient-split">${recipient.split}% (${recipient.type || 'node'})</div>
                    ${recipient.address ? `<div class="recipient-address">${recipient.address.substring(0, 20)}...</div>` : ''}
                </div>
            `).join('');
        }
        
        // Handle time splits (time-based splits)
        if (hasTimeSplits) {
            splitsCount = v4vData.timeSplits.length;
            splitsType = 'time periods';
            splitsContent = v4vData.timeSplits.map(split => `
                <div class="nested-split-item">
                    <div class="nested-split-time">${this.formatTime(parseFloat(split.startTime))} - ${this.formatTime(parseFloat(split.startTime) + parseFloat(split.duration))}</div>
                    <div class="nested-split-percentage">${split.remotePercentage || '100'}%</div>
                    ${split.remoteItem ? `
                        <div class="nested-remote-item">
                            <span class="nested-remote-feed">→ ${split.remoteItem.feedGuid.substring(0, 8)}...</span>
                            <span class="nested-remote-episode">${split.remoteItem.itemGuid.substring(0, 8)}...</span>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }
        
        // Create the nested splits HTML
        const nestedSplitsHtml = `
            <div class="nested-splits">
                <div class="nested-splits-header">
                    <span class="nested-label">🎵 Nested V4V Splits (${splitsCount} ${splitsType})</span>
                </div>
                <div class="nested-splits-content">
                    ${splitsContent}
                </div>
            </div>
        `;
        
        // Add the nested splits to the remote-info div
        remoteInfo.insertAdjacentHTML('beforeend', nestedSplitsHtml);
        console.log('✅ Successfully added V4V splits UI to remote item');
    }

    // Helper function to generate SHA1 hash for Podcast Index API authentication
    async sha1(str) {
        const buffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    displayChaptersError(episodeIndex) {
        const chaptersContainer = document.querySelector(`[data-episode="${episodeIndex}"] .chapters-loading`);
        if (chaptersContainer) {
            chaptersContainer.innerHTML = '<div class="chapters-error">Failed to load chapters</div>';
        }
    }

    // Validate chapter timing - check for sequential timestamps and no overlaps
    validateChapterTiming(chaptersData, episodeIndex) {
        const errors = [];
        const chapters = chaptersData.chapters || [];

        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            const nextChapter = chapters[i + 1];

            // Check for valid startTime
            if (chapter.startTime === undefined || chapter.startTime < 0) {
                errors.push(`Chapter ${i + 1}: Invalid start time`);
            }

            // Check times are sequential (no overlaps)
            if (nextChapter && chapter.startTime >= nextChapter.startTime) {
                errors.push(`Chapter ${i + 1}: Time overlap at ${this.formatTime(chapter.startTime)}`);
            }

            // Check chapter has a title
            if (!chapter.title || chapter.title.trim() === '') {
                errors.push(`Chapter ${i + 1}: Missing title`);
            }
        }

        // Inject errors into the episode card
        if (errors.length > 0) {
            const episodeCard = document.querySelector(`[data-episode="${episodeIndex}"]`);
            if (episodeCard) {
                // Add has-issues class if not already present
                episodeCard.classList.add('has-issues');

                // Update or create error badge
                let errorBadge = episodeCard.querySelector('.error-badge');
                if (!errorBadge) {
                    const badges = episodeCard.querySelector('.episode-badges');
                    const expandBtn = badges.querySelector('.expand-btn');
                    errorBadge = document.createElement('span');
                    errorBadge.className = 'episode-badge error-badge';
                    badges.insertBefore(errorBadge, expandBtn);
                }
                const currentCount = parseInt(errorBadge.textContent) || 0;
                const newCount = currentCount + errors.length;
                errorBadge.textContent = `${newCount} Issue${newCount > 1 ? 's' : ''}`;

                // Add errors to episode-errors container or create one
                let errorsContainer = episodeCard.querySelector('.episode-errors');
                if (!errorsContainer) {
                    errorsContainer = document.createElement('div');
                    errorsContainer.className = 'episode-errors';
                    const content = episodeCard.querySelector('.episode-content');
                    content.insertBefore(errorsContainer, content.firstChild);
                }
                errors.forEach(err => {
                    errorsContainer.innerHTML += `<div class="episode-error">❌ ${err}</div>`;
                });
            }
        }

        return errors;
    }

    // Validate V4V for songs only (remote items)
    validateSongV4V(episode, episodeIndex) {
        const errors = [];
        const warnings = [];

        if (!episode.value?.timeSplits) {
            warnings.push(`Episode ${episodeIndex + 1}: No V4V time splits found`);
            return { errors, warnings };
        }

        // Only check splits that have remoteItem (these are songs)
        const songSplits = episode.value.timeSplits.filter(split => split.remoteItem);

        if (songSplits.length === 0) {
            warnings.push(`Episode ${episodeIndex + 1}: No songs (remote items) found in V4V splits`);
            return { errors, warnings };
        }

        songSplits.forEach((split, i) => {
            const songTime = this.formatTime(parseFloat(split.startTime));

            // Check remote item has required fields
            if (!split.remoteItem.feedGuid) {
                errors.push(`Episode ${episodeIndex + 1}, Song at ${songTime}: Missing feed GUID`);
            }
            if (!split.remoteItem.itemGuid) {
                errors.push(`Episode ${episodeIndex + 1}, Song at ${songTime}: Missing item GUID`);
            }

            // Check split has valid percentage
            if (split.remotePercentage) {
                const pct = parseFloat(split.remotePercentage);
                if (isNaN(pct) || pct < 0 || pct > 100) {
                    errors.push(`Episode ${episodeIndex + 1}, Song at ${songTime}: Invalid remote percentage (${split.remotePercentage})`);
                }
            }

            // Check duration is valid
            if (!split.duration || parseFloat(split.duration) <= 0) {
                warnings.push(`Episode ${episodeIndex + 1}, Song at ${songTime}: Missing or invalid duration`);
            }
        });

        return { errors, warnings };
    }

    // Display validation results in the validation section
    displayValidationResults(allErrors, allWarnings) {
        const validationSection = document.getElementById('validationSection');
        const summaryEl = document.getElementById('validationSummary');
        const detailsEl = document.getElementById('validationDetails');

        if (!validationSection || !summaryEl || !detailsEl) return;

        validationSection.style.display = 'block';

        const errorCount = allErrors.length;
        const warningCount = allWarnings.length;

        // Summary
        if (errorCount === 0 && warningCount === 0) {
            summaryEl.innerHTML = `
                <div class="validation-pass">
                    <span class="validation-icon">✅</span>
                    <span>All checks passed!</span>
                </div>
            `;
        } else {
            summaryEl.innerHTML = `
                <div class="validation-counts">
                    ${errorCount > 0 ? `<span class="error-count">❌ ${errorCount} error${errorCount !== 1 ? 's' : ''}</span>` : ''}
                    ${warningCount > 0 ? `<span class="warning-count">⚠️ ${warningCount} warning${warningCount !== 1 ? 's' : ''}</span>` : ''}
                </div>
            `;
        }

        // Details
        let detailsHtml = '';

        if (errorCount > 0) {
            detailsHtml += `
                <div class="validation-errors">
                    <h3>Errors</h3>
                    <ul>
                        ${allErrors.map(err => `<li>${err}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        if (warningCount > 0) {
            detailsHtml += `
                <div class="validation-warnings">
                    <h3>Warnings</h3>
                    <ul>
                        ${allWarnings.map(warn => `<li>${warn}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        detailsEl.innerHTML = detailsHtml;
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
        const container = document.getElementById('validationDetails');
        const validationSection = document.getElementById('validationSection');
        const validations = [];

        if (!this.feedData || !container) return;

        // Show the validation section
        if (validationSection) validationSection.style.display = 'block';

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
        const episodesContainer = document.getElementById('episodesContainer');
        if (episodesContainer) episodesContainer.innerHTML = '<div class="placeholder">Enter a feed URL above and click "Check Feed"</div>';

        const episodeCount = document.getElementById('episodeCount');
        const lastUpdated = document.getElementById('lastUpdated');
        const liveItems = document.getElementById('liveItems');
        const totalDuration = document.getElementById('totalDuration');
        const feedSummary = document.getElementById('feedSummary');
        const validationSection = document.getElementById('validationSection');

        if (episodeCount) episodeCount.textContent = '0';
        if (lastUpdated) lastUpdated.textContent = '-';
        if (liveItems) liveItems.textContent = '0';
        if (totalDuration) totalDuration.textContent = '-';
        if (feedSummary) feedSummary.style.display = 'none';
        if (validationSection) validationSection.style.display = 'none';

        this.updateStatus('', '');
    }

    displayPodcastIndexInfo() {
        const container = document.getElementById('podcastIndexContainer');
        if (!this.feedData || !container) return;

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

    // Make toggle functions globally accessible
    window.toggleRemoteDetails = (button) => checker.toggleRemoteDetails(button);
    window.toggleChapters = (button) => checker.toggleChapters(button);
    window.toggleNestedSplits = (button) => checker.toggleNestedSplits(button);

    // Toggle episode expand/collapse
    window.toggleEpisode = (header) => {
        const card = header.closest('.episode-card');
        const content = card.querySelector('.episode-content');
        const expandBtn = card.querySelector('.expand-btn');
        if (content) {
            content.classList.toggle('collapsed');
            if (expandBtn) {
                expandBtn.textContent = content.classList.contains('collapsed') ? '▼ Details' : '▲ Hide';
            }
        }
    };

    window.toggleChapter = (chapterItem) => {
        const details = chapterItem.querySelector('.chapter-details');
        const expandIcon = chapterItem.querySelector('.chapter-expand');
        if (details) {
            const wasCollapsed = details.classList.contains('collapsed');
            details.classList.toggle('collapsed');
            if (expandIcon) {
                expandIcon.textContent = details.classList.contains('collapsed') ? '▼' : '▲';
            }

            // Load artist info when expanding
            if (wasCollapsed) {
                const v4vContainer = details.querySelector('.chapter-v4v');
                if (v4vContainer) {
                    const feedGuid = v4vContainer.dataset.feedGuid;
                    const itemGuid = v4vContainer.dataset.itemGuid;
                    if (feedGuid && itemGuid) {
                        checker.loadArtistInfo(v4vContainer, feedGuid, itemGuid);
                    }
                }
            }
        }
    };

    // Auto-load the default feed if URL is pre-filled
    const feedInput = document.getElementById('feedUrl');
    if (feedInput && feedInput.value) {
        console.log('Auto-loading default feed:', feedInput.value);
        checker.fetchFeed();
    }
});
