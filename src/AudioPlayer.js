import { useEffect, useRef, useState } from 'react';

const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const PrevIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
        <path d="M18 5.5v13L8.5 12z" />
        <path d="M6 5.5v13" />
    </svg>
);

const NextIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
        <path d="M6 5.5v13L15.5 12z" />
        <path d="M18 5.5v13" />
    </svg>
);

const PlayIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8.5 5.6v12.8a.7.7 0 0 0 1.07.6l10-6.4a.7.7 0 0 0 0-1.2l-10-6.4a.7.7 0 0 0-1.07.6z" />
    </svg>
);

const PauseIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="7" y="5" width="3.8" height="14" rx="1.3" />
        <rect x="13.2" y="5" width="3.8" height="14" rx="1.3" />
    </svg>
);

const AudioPlayer = ({ tracks, artistName }) => {
    const audioRef = useRef(null);
    const resumeOnLoad = useRef(false);
    const [index, setIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const track = tracks[index];
    const cover = track.album && track.album.images && track.album.images.length
        ? track.album.images[track.album.images.length - 1].url
        : null;

    useEffect(() => {
        setCurrentTime(0);
        setDuration(0);
        if (resumeOnLoad.current && audioRef.current) {
            audioRef.current.play().catch(() => {});
        }
    }, [index]);

    const step = (delta) => {
        resumeOnLoad.current = audioRef.current ? !audioRef.current.paused : false;
        setIndex((current) => (current + delta + tracks.length) % tracks.length);
    };

    const toggle = () => {
        const audio = audioRef.current;
        if (audio.paused) {
            audio.play().catch(() => {});
        } else {
            audio.pause();
        }
    };

    const seek = (event) => {
        const time = Number(event.target.value);
        audioRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const filled = duration ? (currentTime / duration) * 100 : 0;

    return (
        <div className="player">
            <audio
                ref={audioRef}
                src={track.preview_url}
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={(event) => setCurrentTime(event.target.currentTime)}
                onLoadedMetadata={(event) => setDuration(event.target.duration)}
                onEnded={() => (tracks.length > 1 ? step(1) : setIsPlaying(false))}
            />

            <div className="player-top">
                {cover && <img className="player-art" src={cover} alt="" />}
                <div className="player-meta">
                    <div className="player-title">{track.name}</div>
                    <div className="player-artist">{artistName}</div>
                    <div className="player-controls">
                        <button
                            type="button"
                            className="player-step"
                            onClick={() => step(-1)}
                            disabled={tracks.length < 2}
                            aria-label="Previous track"
                        >
                            <PrevIcon />
                        </button>
                        <button
                            type="button"
                            className="player-toggle"
                            onClick={toggle}
                            aria-label={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying ? <PauseIcon /> : <PlayIcon />}
                        </button>
                        <button
                            type="button"
                            className="player-step"
                            onClick={() => step(1)}
                            disabled={tracks.length < 2}
                            aria-label="Next track"
                        >
                            <NextIcon />
                        </button>
                    </div>
                </div>
            </div>

            <input
                className="player-scrubber"
                type="range"
                min="0"
                max={duration || 0}
                step="0.01"
                value={currentTime}
                onChange={seek}
                style={{ backgroundSize: `${filled}% 100%` }}
                aria-label="Seek"
            />

            <div className="player-times">
                <span>{formatTime(currentTime)}</span>
                <span>-{formatTime(duration - currentTime)}</span>
            </div>
        </div>
    );
};

export default AudioPlayer;
