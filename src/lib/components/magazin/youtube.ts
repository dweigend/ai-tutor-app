export function youtubeEmbed(videoId: string, playing: boolean): string | undefined {
	return playing ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1` : undefined;
}

export function youtubeWatch(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`;
}
