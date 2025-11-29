import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Loader2, Award, X, Eye, Shuffle } from 'lucide-react';

// URL API default (sesuaikan dengan konfigurasi Flask/Proxy Anda)
// Logic: Jika bukan localhost, gunakan VITE_APP_API_URL dari environment variable
const API_BASE_URL = 
    (window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1'))
    ? 'http://localhost:5000' 
    : import.meta.env.VITE_APP_API_URL || ''; // Gunakan ENV variable di deployment

const TOTAL_ROUNDS = 10; // Total putaran disesuaikan menjadi 10

// --- TYPESCRIPT INTERFACES ---

interface CellState {
    value: number;
    player: number; // ID Pemain (0 atau 1)
}

interface PlayerState {
    id: number;
    name: string;
    is_ai: boolean;
    color_id: number;
    hand: number[];
    deck_count: number;
    hand_count: number;
    total_cards: number;
}

interface GameState {
    game_id: string;
    board: (CellState | null)[][];
    currentPlayerId: number;
    winnerId: number | null;
    players: PlayerState[];
    gameOver: boolean;
}

interface RoundResult {
    round: number;
    deckTypeP0: string;
    deckTypeP1: string;
    winner: 'AI 1' | 'AI 2' | 'Draw';
    score: string; // P0-P1 score (N/A jika tidak dihitung backend)
}

// Warna Pemain (0=Merah, 1=Hijau, 2=Biru, 3=Kuning)
const PLAYER_COLORS: string[] = ['#dc2626', '#10b981', '#3b82f6', '#fcd34d'];


// --- FIXED DECKS BERDASARKAN GAMBAR (Total 20 Set) ---
// DIPASTIKAN SEMUA MEMILIKI 18 ELEMEN
const FIXED_DECKS: number[][] = [
    // Set 1
    [6, 1, 3, 8, 4, 2, 7, 6, 9, 2, 3, 4, 9, 5, 1, 5, 8, 7], 
    // Set 2
    [5, 1, 3, 7, 6, 8, 2, 3, 4, 8, 5, 9, 7, 9, 6, 1, 2, 4], 
    // Set 3
    [6, 2, 5, 6, 5, 4, 1, 3, 3, 2, 8, 7, 8, 9, 1, 4, 9, 7],
    // Set 4
    [3, 7, 6, 4, 5, 7, 2, 6, 5, 4, 8, 1, 1, 9, 2, 9, 3, 8],
    // Set 5
    [9, 6, 1, 3, 6, 4, 4, 8, 9, 5, 2, 3, 7, 1, 8, 7, 5, 2],
    // Set 6
    [9, 2, 6, 1, 6, 3, 8, 7, 4, 2, 8, 9, 5, 3, 7, 5, 4, 1],
    // Set 7
    [3, 7, 4, 5, 7, 6, 9, 3, 9, 5, 6, 2, 8, 2, 4, 1, 8, 1],
    // Set 8
    [3, 7, 1, 5, 6, 1, 4, 2, 5, 9, 4, 8, 3, 8, 9, 2, 7, 6],
    // Set 9
    [5, 6, 3, 8, 8, 9, 1, 5, 7, 4, 1, 7, 3, 9, 2, 6, 4, 2],
    // Set 10
    [9, 5, 3, 2, 8, 6, 4, 3, 4, 2, 7, 1, 8, 1, 7, 9, 6, 5],
    
    // Set 11
    [3, 1, 3, 2, 9, 6, 2, 8, 1, 7, 4, 8, 7, 4, 6, 5, 9, 5],
    // Set 12
    [1, 6, 3, 4, 6, 4, 7, 7, 9, 3, 5, 5, 8, 2, 2, 1, 9, 8],
    // Set 13
    [9, 8, 9, 3, 4, 6, 6, 7, 3, 1, 1, 2, 5, 2, 4, 1, 8, 5, 7],
    // Set 14
    [2, 6, 5, 9, 1, 6, 3, 7, 7, 2, 9, 1, 8, 8, 4, 3, 5, 4],
    // Set 15
    [3, 4, 8, 9, 4, 7, 7, 6, 2, 5, 1, 1, 3, 6, 2, 5, 8, 9],
    // Set 16
    [5, 1, 4, 9, 2, 9, 8, 6, 5, 8, 7, 3, 6, 1, 4, 7, 3, 2],
    // Set 17
    [2, 8, 2, 3, 4, 7, 1, 8, 3, 6, 6, 5, 1, 4, 5, 9, 7, 9],
    // Set 18
    [5, 9, 6, 7, 1, 3, 4, 4, 9, 5, 2, 8, 2, 3, 8, 1, 7, 6],
    // Set 19
    [9, 1, 9, 4, 5, 5, 2, 2, 3, 8, 8, 7, 4, 3, 7, 1, 6, 6],
    // Set 20
    [2, 4, 7, 1, 6, 2, 5, 3, 8, 3, 5, 7, 4, 8, 9, 1, 9, 6],
];

// Pisahkan 20 set menjadi dua grup 10
const SETS_1_10 = FIXED_DECKS.slice(0, 10).map(deck => deck.slice()); // Sets 1-10
const SETS_11_20 = FIXED_DECKS.slice(10, 20).map(deck => deck.slice()); // Sets 11-20


// --- API UTILITIES ---

// Helper function to handle API calls with error parsing
const apiFetch = async (endpoint: string, method: string = 'GET', body: unknown = null): Promise<GameState> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
        // Memastikan tipe 'error' diketahui
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        const errorMessage = errorData.error || response.statusText;
        throw new Error(`Failed to fetch. API Error: ${errorMessage}`);
    }

    return response.json() as Promise<GameState>;
};


const AITournamentHarness: React.FC = () => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [gameId, setGameId] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>(`Siap untuk memulai turnamen (${TOTAL_ROUNDS} putaran).`);
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [currentRound, setCurrentRound] = useState<number>(0);
    const [tournamentHistory, setTournamentHistory] = useState<RoundResult[]>([]);
    const [ai1Wins, setAi1Wins] = useState<number>(0);
    const [ai2Wins, setAi2Wins] = useState<number>(0);
    const [draws, setDraws] = useState<number>(0);
    const [isSimulating, setIsSimulating] = useState<boolean>(false); 
    const [showAllDecks, setShowAllDecks] = useState<boolean>(false); 
    // State untuk menentukan apakah dek telah ditukar dari konfigurasi default
    const [isDeckSwapped, setIsDeckSwapped] = useState<boolean>(false); 
    
   
    // Toggle function for the card viewer
    const toggleAllDecks = () => setShowAllDecks(prev => !prev);
    
    // Fungsi untuk menukar dek dan mereset turnamen
    const toggleAndResetDecks = useCallback(() => {
        setIsDeckSwapped(prev => !prev);
        const newSwappedState = !isDeckSwapped;
        
        // Reset state turnamen
        setAi1Wins(0);
        setAi2Wins(0);
        setDraws(0);
        setTournamentHistory([]);
        setIsRunning(false);
        setCurrentRound(0);
        setGameState(null);
        setGameId(null);
        
        const p0Sets = newSwappedState ? '11-20' : '1-10';
        const p1Sets = newSwappedState ? '1-10' : '11-20';
        setStatusMessage(`Deck Ditukar. Siap. P0 (AI 1) menggunakan Set ${p0Sets} dan P1 (AI 2) menggunakan Set ${p1Sets}.`);
    }, [isDeckSwapped]);

    // --- LOGIKA DECK KHUSUS UNTUK TESTING HARNESS (10 Putaran) ---
    const getRoundDecks = useCallback((roundNum: number): { deckP0: number[], deckP1: number[], deckTypeP0: string, deckTypeP1: string } => {
        
        const deckIndex = roundNum - 1; // 0 sampai 9 (untuk 10 putaran)
        
        if (deckIndex < 0 || deckIndex >= TOTAL_ROUNDS) {
            return { deckP0: [], deckP1: [], deckTypeP0: 'N/A', deckTypeP1: 'N/A' };
        }

        // Tentukan set kartu yang digunakan di putaran ini
        const set1_10 = SETS_1_10[deckIndex];
        const set11_20 = SETS_11_20[deckIndex];

        let deckP0: number[];
        let deckP1: number[];
        let deckTypeP0: string;
        let deckTypeP1: string;

        if (!isDeckSwapped) {
            // Default: P0 (Set 1-10), P1 (Set 11-20)
            deckP0 = set1_10;
            deckP1 = set11_20;
            deckTypeP0 = `Set ${deckIndex + 1} (AI 1 Default)`;
            deckTypeP1 = `Set ${deckIndex + 11} (AI 2 Default)`;
        } else {
            // Swapped: P0 (Set 11-20), P1 (Set 1-10)
            deckP0 = set11_20;
            deckP1 = set1_10;
            deckTypeP0 = `Set ${deckIndex + 11} (AI 1 Swapped)`;
            deckTypeP1 = `Set ${deckIndex + 1} (AI 2 Swapped)`;
        }
        
        return { deckP0, deckP1, deckTypeP0, deckTypeP1 };
    }, [isDeckSwapped]);

    const startRound = useCallback(async (roundNum: number) => {
        if (roundNum > TOTAL_ROUNDS) {
            setStatusMessage('Turnamen Selesai!');
            setIsRunning(false);
            return;
        }
        
        setCurrentRound(roundNum);
        setGameState(null);
        setGameId(null);
        setIsSimulating(true);

        const { deckP0, deckP1, deckTypeP0, deckTypeP1 } = getRoundDecks(roundNum);
        
        setStatusMessage(`Memulai Putaran ${roundNum} / ${TOTAL_ROUNDS} (P0: ${deckTypeP0}, P1: ${deckTypeP1})...`);

        try {
            // KIRIM 18 KARTU UTUH ke backend
            const newState = await apiFetch('/start_ai_test', 'POST', {
                deckP0, // 18 kartu utuh
                deckP1, // 18 kartu utuh
            });
            setGameState(newState);
            setGameId(newState.game_id);
            setIsSimulating(false);
            
            setStatusMessage(`Putaran ${roundNum} / ${TOTAL_ROUNDS} dimulai. Giliran P${newState.currentPlayerId + 1}.`);
        } catch (error) {
            // Memastikan tipe 'error' diketahui
            const errorMessage = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Gagal memulai putaran ${roundNum}: ${errorMessage}. Pastikan backend Python (testing_api.py) berjalan.`);
            setIsSimulating(false);
            setIsRunning(false);
        }
    }, [getRoundDecks]);

    const startTournament = useCallback(() => {
        setAi1Wins(0);
        setAi2Wins(0);
        setDraws(0);
        setTournamentHistory([]);
        setIsRunning(true);
        startRound(1);
    }, [startRound]);


    const makeAIMove = useCallback(async () => {
        if (!gameId || gameState?.gameOver || isSimulating) return;

        setIsSimulating(true);
        setStatusMessage(`AI P${gameState!.currentPlayerId + 1} sedang berpikir...`);

        try {
            const newState = await apiFetch('/ai_move', 'POST', { gameId });
            setGameState(newState);

            if (newState.gameOver) {
                
                let winner: 'AI 1' | 'AI 2' | 'Draw' = 'Draw';
                if (newState.winnerId === 0) {
                    setAi1Wins(prev => prev + 1);
                    winner = 'AI 1';
                } else if (newState.winnerId === 1) {
                    setAi2Wins(prev => prev + 1);
                    winner = 'AI 2';
                } else {
                    setDraws(prev => prev + 1);
                    winner = 'Draw';
                }

                const { deckTypeP0, deckTypeP1 } = getRoundDecks(currentRound);

                const result: RoundResult = {
                    round: currentRound,
                    deckTypeP0,
                    deckTypeP1,
                    winner,
                    score: 'N/A', 
                };
                setTournamentHistory(prev => [...prev, result]);
                
                setStatusMessage(`GAME OVER Putaran ${currentRound}! Pemenang: ${winner}.`);
                setIsSimulating(false);

                if (currentRound < TOTAL_ROUNDS) {
                    setTimeout(() => startRound(currentRound + 1), 1000); // Pause 1 second before next round
                } else {
                    setStatusMessage('Turnamen Selesai!');
                    setIsRunning(false);
                }

            } else {
                setStatusMessage(`Giliran P${newState.currentPlayerId + 1}.`);
                setIsSimulating(false);
            }
        } catch (error) {
            // Memastikan tipe 'error' diketahui
            const errorMessage = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Gagal memindahkan AI: ${errorMessage}`);
            setIsSimulating(false);
            setIsRunning(false);
        }
    }, [gameId, gameState, isSimulating, currentRound, startRound, getRoundDecks]);
    
    // Auto-run loop for the tournament
    useEffect(() => {
        let interval: number | null = null; 

        // Karena tombol JEDA dihapus, isRunning hanya diatur ke true saat startTournament
        if (isRunning && gameId && gameState && !gameState.gameOver && !isSimulating) {
            // Short delay for fast simulation
            interval = window.setInterval(makeAIMove, 50); 
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isRunning, gameId, gameState, isSimulating, makeAIMove]);

    // --- RENDER COMPONENTS ---

    // Function to render a single card
    const renderCard = (value: number, playerColor: string) => (
        <div 
            className="flex items-center justify-center w-10 h-10 text-lg font-bold text-white rounded-full shadow-md transition-all duration-100"
            style={{ backgroundColor: playerColor, border: `2px solid ${playerColor === '#fcd34d' ? '#a16207' : 'white'}` }}
        >
            {value}
        </div>
    );

    // Function to render the game board
    const renderBoard = () => {
        if (!gameState) return <div className="text-gray-500 p-8 text-center w-full bg-white rounded-lg shadow">Papan tidak tersedia. Mulai turnamen.</div>;

        return (
            <div className="grid grid-cols-9 w-full max-w-xl aspect-square bg-gray-300 p-2 rounded-xl shadow-2xl">
                {gameState.board.flatMap((row, r) => 
                    row.map((cell, c) => {
                        const isCenter = r === 4 && c === 4;
                        const bgColor = isCenter && !gameState.board[4][4] ? 'bg-indigo-100' : 'bg-white';
                        
                        return (
                            <div key={`${r}-${c}`} className={`flex items-center justify-center p-0.5 border border-gray-200 transition-colors ${bgColor}`}>
                                {cell ? renderCard(cell.value, PLAYER_COLORS[cell.player]) : (
                                    isCenter ? 
                                    <div className="w-8 h-8 border-2 border-dashed border-indigo-400 rounded-full flex items-center justify-center text-xs text-indigo-400">C</div> :
                                    <div className="w-8 h-8"></div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        );
    };

    // Function to render the player panel (Diperbarui untuk menandai kartu yang dimainkan pada Set Statis)
    const renderPlayerPanel = (player: PlayerState, deckType: string, currentDeck: number[]) => {
        const isCurrent = player.id === gameState?.currentPlayerId && !gameState?.gameOver;
        const isWinner = player.id === gameState?.winnerId;
        const color = PLAYER_COLORS[player.color_id];
        const playerColorName = player.id === 0 ? 'Merah' : 'Hijau'; 
        
        const activeStyle = isCurrent ? {
            borderColor: color,
            boxShadow: `0 0 0 4px white, 0 0 0 6px ${color}`,
            transform: 'scale(1.02)'
        } : {
            borderColor: color,
        };
        
        const deckLabelColor = player.id === 0 ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800';

        // --- Logika Menghitung Kartu yang Dimainkan ---
        const totalCardsInSet = 18;
        const cardsRemaining = player.hand_count + player.deck_count;
        const cardsPlayed = totalCardsInSet - cardsRemaining;
        
        return (
            <div 
                className={`p-4 rounded-xl shadow-lg transition-all duration-300 bg-white border-2 ${isCurrent ? 'opacity-100' : 'opacity-90'}`}
                style={{ ...activeStyle }}
            >
                <h3 className="text-xl font-bold flex items-center mb-2" style={{ color }}>
                    {player.name} ({playerColorName})
                    {isCurrent && <Loader2 className="ml-2 w-5 h-5 animate-spin" />}
                    {isWinner && <Award className="ml-2 w-5 h-5 text-yellow-500" />}
                </h3>
                
                {/* Bagian Dinamis Kartu Sisa (Hand + Deck Count) - INI YANG BERKURANG */}
                <p className="text-sm text-gray-600 mb-2 font-mono">
                    Kartu Sisa: <span className="font-semibold">{player.hand_count} (Tangan) + {player.deck_count} (Deck)</span>
                </p>
                
                {/* Tampilan Hand (Dinamsis dan Berkurang) */}
                <div className="flex flex-wrap gap-1 border-t pt-2 mt-2">
                    <span className="text-sm font-medium text-gray-500 mr-2">Kartu di Tangan:</span>
                    {player.hand.map((cardValue, index) => (
                        <div 
                            key={index}
                            className="text-xs font-semibold px-2 py-1 rounded-full text-white shadow-sm"
                            style={{ backgroundColor: color }}
                        >
                            {cardValue}
                        </div>
                    ))}
                    {player.hand_count === 0 && <span className="text-sm text-gray-500">Kosong.</span>}
                </div>
                
                 {/* Tampilan Set Kartu Statis (18 kartu penuh) - Menandai kartu yang Dimainkan */}
                 <div className="mt-4 border-t pt-2">
                     <p className="text-sm font-bold text-gray-700 mb-1">Set Kartu P{player.id+1} Putaran Ini (<span className={`px-1 rounded ${deckLabelColor}`}>{deckType}</span>):</p>
                     <div className="flex flex-wrap gap-1">
                        {currentDeck
                            .map((v, i) => {
                            const isPlayed = i < cardsPlayed; // Tandai kartu dari indeks 0 hingga cardsPlayed-1
                            const playedStyle = isPlayed ? 'line-through opacity-50' : '';

                            return (
                                <span 
                                    key={i} 
                                    className={`text-xs px-1.5 py-0.5 rounded ${v <= 3 ? 'bg-red-200' : v >= 7 ? 'bg-green-200' : 'bg-yellow-200'} ${playedStyle}`}
                                >
                                    {v}
                                </span>
                            );
                        })}
                         <span className="text-xs text-gray-500 ml-1">
                             (18 total)
                         </span>
                     </div>
                </div>
            </div>
        );
    };
    
    // Function to render all card sets in a modal
    const renderAllDecksViewer = () => {
        if (!showAllDecks) return null;

        return (
            <div className="fixed inset-0 z-50 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
                    <div className="flex justify-between items-center border-b pb-3 mb-4">
                        <h2 className="text-2xl font-bold text-gray-800">20 Set Kartu Turnamen Tetap (Fixed Decks)</h2>
                        <button onClick={toggleAllDecks} className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {FIXED_DECKS.map((deck, index) => {
                            const setNum = index + 1;
                            
                            let ai1SetsRange: string;
                            let ai2SetsRange: string;
                            
                            if (!isDeckSwapped) {
                                // Default: AI 1 = Set 1-10, AI 2 = Set 11-20
                                ai1SetsRange = '1-10';
                                ai2SetsRange = '11-20';
                            } else {
                                // Swapped: AI 1 = Set 11-20, AI 2 = Set 1-10
                                ai1SetsRange = '11-20';
                                ai2SetsRange = '1-10';
                            }

                            // Tentukan AI mana yang menggunakan Set ini saat ini
                            const isCurrentAI1Deck = 
                                (!isDeckSwapped && setNum <= 10) || 
                                (isDeckSwapped && setNum > 10);
                            
                            const label = isCurrentAI1Deck 
                                ? `Set ${setNum} (AI 1: ${ai1SetsRange})`
                                : `Set ${setNum} (AI 2: ${ai2SetsRange})`;
                            
                            const labelColor = isCurrentAI1Deck 
                                ? 'bg-red-100 text-red-700' 
                                : 'bg-green-100 text-green-700';

                            return (
                                <div key={setNum} className="p-3 border rounded-lg shadow-sm">
                                    <p className={`text-sm font-bold mb-2 px-2 py-0.5 rounded-md text-center ${labelColor}`}>
                                        {label}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {deck.map((value, cardIndex) => (
                                            <span 
                                                key={cardIndex} 
                                                className={`text-xs px-1.5 py-0.5 rounded ${value <= 3 ? 'bg-red-200' : value >= 7 ? 'bg-green-200' : 'bg-yellow-200'}`}
                                            >
                                                {value}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };
    
    const currentTotalRounds = tournamentHistory.length;
    
    // Perhitungan Win Rate yang akan digunakan di JSX (memperbaiki warning unused vars)
    const ai1WinRate = currentTotalRounds > 0 ? ((ai1Wins / currentTotalRounds) * 100).toFixed(1) : 0;
    const ai2WinRate = currentTotalRounds > 0 ? ((ai2Wins / currentTotalRounds) * 100).toFixed(1) : 0;
    
    // Get deck data for preview, ensuring currentRound is valid (min 1)
    const { deckP0: currentDeckP0, deckP1: currentDeckP1, deckTypeP0, deckTypeP1 } = getRoundDecks(currentRound > 0 ? currentRound : 1);

    const currentP0Sets = isDeckSwapped ? 'Set 11-20' : 'Set 1-10';
    const currentP1Sets = isDeckSwapped ? 'Set 1-10' : 'Set 11-20';


    return (
        <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-6 border-b pb-2">
                Punto AI Test Harness (Turnamen AI vs AI)
            </h1>

            {/* Control Panel & Statistik */}
            <div className="mb-6 p-4 bg-white rounded-xl shadow-lg">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                    <h2 className="text-xl font-bold text-gray-800">
                        Putaran {currentRound} / {TOTAL_ROUNDS}
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={startTournament}
                            disabled={isSimulating}
                            className={`px-4 py-2 rounded-lg font-bold text-white transition-colors flex items-center ${
                                isSimulating ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'
                            }`}
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Mulai Turnamen Baru
                        </button>
                        
                        {/* Button Switch Deck */}
                        <button
                            onClick={toggleAndResetDecks}
                            disabled={isRunning || isSimulating}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center font-bold"
                        >
                            <Shuffle className="w-4 h-4 mr-2" />
                            Switch Deck ({currentP0Sets} &lt;-&gt; {currentP1Sets})
                        </button>
                        {/* Button Lihat Semua Set Kartu */}
                        <button
                            onClick={toggleAllDecks}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center font-bold"
                        >
                            <Eye className="w-4 h-4 mr-2" />
                            {showAllDecks ? 'Tutup Set Kartu' : 'Lihat Semua Set Kartu'}
                        </button>
                    </div>
                </div>
                
                <div className="flex justify-center gap-10 border-t pt-4">
                    <div className="text-center">
                        <p className="text-2xl font-bold" style={{ color: PLAYER_COLORS[0] }}>{ai1Wins}</p>
                        <p className="text-sm text-gray-600">AI 1 Menang ({ai1WinRate}%) ({currentP0Sets})</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-gray-800">{draws}</p>
                        <p className="text-sm text-gray-600">Seri</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold" style={{ color: PLAYER_COLORS[1] }}>{ai2Wins}</p>
                        <p className="text-sm text-gray-600">AI 2 Menang ({ai2WinRate}%) ({currentP1Sets})</p>
                    </div>
                </div>

                <div className="mt-4 text-center">
                    <p className={`text-lg font-semibold ${gameState?.gameOver ? 'text-green-700' : 'text-blue-600'}`}>
                        {statusMessage}
                    </p>
                </div>
            </div>

            {/* Papan Permainan dan Info Pemain */}
            <div className="grid md:grid-cols-3 gap-8 mb-8">
                {/* Kolom Kiri: AI 1 (P0) */}
                <div className="md:col-span-1 space-y-4">
                    {gameState && gameState.players.filter(p => p.id === 0).map(p => 
                        renderPlayerPanel(p, deckTypeP0, currentDeckP0)
                    )}
                </div>

                {/* Kolom Tengah: Papan */}
                <div className="md:col-span-1 flex justify-center items-start">
                    {renderBoard()}
                </div>

                {/* Kolom Kanan: AI 2 (P1) */}
                <div className="md:col-span-1 space-y-4">
                    {gameState && gameState.players.filter(p => p.id === 1).map(p => 
                        renderPlayerPanel(p, deckTypeP1, currentDeckP1)
                    )}
                </div>
            </div>
            
            {/* Tabel Hasil Turnamen */}
            <div className="mt-8 bg-white p-6 rounded-xl shadow-lg overflow-x-auto">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Hasil Turnamen</h2>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Round</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deck P0 (AI 1)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deck P1 (AI 2)</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Pemenang</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Skor (P0-P1)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {tournamentHistory.slice().reverse().map((result, index) => (
                            <tr 
                                key={index} 
                                className={result.winner === 'AI 1' ? 'bg-red-50' : result.winner === 'AI 2' ? 'bg-green-50' : 'bg-yellow-50'}
                            >
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{result.round}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.deckTypeP0}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.deckTypeP1}</td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-center ${result.winner === 'AI 1' ? 'text-red-600' : result.winner === 'AI 2' ? 'text-green-600' : 'text-yellow-600'}`}>{result.winner}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{result.score}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Render All Decks Viewer (Modal) */}
            {renderAllDecksViewer()}

        </div>
    );
};

export default AITournamentHarness;