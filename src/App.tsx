import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Play, Loader2, Award, ChevronsRight, X } from 'lucide-react';

// URL API default (sesuaikan dengan konfigurasi Flask/Proxy Anda)
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
const TOTAL_ROUNDS = 24; // Total putaran: 12 vs Jelek + 12 vs Normal

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

// --- DECK UTILITIES ---

// Fungsi Fisher-Yates shuffle
const shuffleArray = (array: number[]): number[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

// Fungsi untuk membuat 18 kartu (2x 1-9), diacak normal
const generateShuffledDeck = (): number[] => {
    const deck = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9];
    return shuffleArray(deck);
};

// Fungsi untuk membuat 18 kartu "jelek-jelek" (nilai rendah dominan)
const generateBadDeck = (): number[] => {
    // 4x 1, 4x 2, 4x 3, 2x 4, 2x 5, 1x 6, 1x 7 (Total 18 kartu)
    const baseDeck = [
        1, 1, 1, 1, 
        2, 2, 2, 2, 
        3, 3, 3, 3, 
        4, 4, 5, 5, 
        6, 7 
    ];
    return shuffleArray(baseDeck);
};

// Generate 24 fixed decks for P0 (always standard/shuffled)
const P0_DECKS = Array(TOTAL_ROUNDS).fill(0).map(() => generateShuffledDeck());
// Generate 12 fixed bad decks for P1 (Rounds 1-12)
const P1_BAD_DECKS = Array(TOTAL_ROUNDS / 2).fill(0).map(() => generateBadDeck());
// Generate 12 fixed good decks for P1 (Rounds 13-24)
const P1_GOOD_DECKS = Array(TOTAL_ROUNDS / 2).fill(0).map(() => generateShuffledDeck());

// --- API UTILITIES ---

const apiFetch = async (endpoint: string, method: string = 'GET', body: unknown = null): Promise<GameState> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
        // Parse error response dari backend, termasuk error 400
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`API Error: ${errorData.error || response.statusText}`);
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
    
    // Strategi AI diset tetap karena ini adalah testing harness
    const [config] = useState<{ strategyP0: string, strategyP1: string }>({
        strategyP0: 'Minimax (Optimal)', 
        strategyP1: 'Minimax (Optimal)', 
    });
    
    const AI_STRATEGIES = ['Minimax (Optimal)']; 

    // --- LOGIKA DECK KHUSUS UNTUK TESTING HARNESS (24 Putaran) ---
    const getRoundDecks = useCallback((roundNum: number): { deckP0: number[], deckP1: number[], deckTypeP0: string, deckTypeP1: string } => {
        
        const deckIndex = roundNum - 1; // 0 sampai 23
        
        if (deckIndex < 0 || deckIndex >= TOTAL_ROUNDS) {
            return { deckP0: [], deckP1: [], deckTypeP0: 'N/A', deckTypeP1: 'N/A' };
        }

        let deckP0: number[] = P0_DECKS[deckIndex];
        let deckP1: number[] = [];
        let deckTypeP0: string = 'Normal (Acak)';
        let deckTypeP1: string = 'Normal (Acak)';

        if (roundNum >= 1 && roundNum <= 12) {
            // Putaran 1-12: P0 (Normal) vs P1 (Jelek/Bad)
            const badDeckIndex = deckIndex;
            deckP1 = P1_BAD_DECKS[badDeckIndex];
            deckTypeP1 = 'Jelek (Nilai Rendah)';
            
        } else if (roundNum >= 13 && roundNum <= 24) {
            // Putaran 13-24: P0 (Normal) vs P1 (Normal/Fair)
            const goodDeckIndex = deckIndex - 12;
            deckP1 = P1_GOOD_DECKS[goodDeckIndex];
            deckTypeP1 = 'Normal (Acak)';
        }
        
        return { deckP0, deckP1, deckTypeP0, deckTypeP1 };
    }, []);

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
            // KIRIM 18 KARTU UTUH (FIX: Hapus .slice(3) yang menyebabkan error 15 kartu)
            const newState = await apiFetch('/start_ai_test', 'POST', {
                deckP0, // 18 kartu utuh
                deckP1, // 18 kartu utuh
            });
            setGameState(newState);
            setGameId(newState.game_id);
            setIsSimulating(false);
            
            setStatusMessage(`Putaran ${roundNum} / ${TOTAL_ROUNDS} dimulai. Giliran P${newState.currentPlayerId + 1}.`);
        } catch (error) {
            setStatusMessage(`Gagal memulai putaran ${roundNum}: ${error.message}. Pastikan backend Python (testing_api.py) berjalan.`);
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
                    setTimeout(() => startRound(currentRound + 1), 1000); // Jeda 1 detik
                } else {
                    setStatusMessage('Turnamen Selesai!');
                    setIsRunning(false);
                }

            } else {
                setStatusMessage(`Giliran P${newState.currentPlayerId + 1}.`);
                setIsSimulating(false);
            }
        } catch (error) {
            setStatusMessage(`Gagal memindahkan AI: ${error.message}`);
            setIsSimulating(false);
            setIsRunning(false);
        }
    }, [gameId, gameState, isSimulating, currentRound, startRound, getRoundDecks]);
    
    // Auto-run loop untuk turnamen
    useEffect(() => {
        let interval: number | null = null; 

        if (isRunning && gameId && gameState && !gameState.gameOver && !isSimulating) {
            // Jeda singkat untuk simulasi cepat
            interval = window.setInterval(makeAIMove, 50); 
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isRunning, gameId, gameState, isSimulating, makeAIMove]);

    const handleSingleMove = () => {
        if (!isRunning && gameId && !gameState?.gameOver) {
            makeAIMove();
        }
    };
    
    // --- KOMPONEN RENDER ---

    const renderCard = (value: number, playerColor: string) => (
        <div 
            className="flex items-center justify-center w-10 h-10 text-lg font-bold text-white rounded-full shadow-md transition-all duration-100"
            style={{ backgroundColor: playerColor, border: `2px solid ${playerColor === '#fcd34d' ? '#a16207' : 'white'}` }}
        >
            {value}
        </div>
    );

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
        
        const deckLabelColor = deckType.includes('Jelek') ? 'bg-red-200' : 'bg-green-200';
        
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
                
                <p className="text-sm text-gray-600 mb-2">
                    Strategi: <span className="font-semibold text-gray-800">{player.id === 0 ? config.strategyP0 : config.strategyP1}</span>
                </p>
                <p className="text-sm text-gray-600 mb-2 font-mono">
                    Kartu Sisa: <span className="font-semibold">{player.hand_count} (Hand) + {player.deck_count} (Deck)</span>
                </p>
                
                <div className="flex flex-wrap gap-1 border-t pt-2 mt-2">
                    <span className="text-sm font-medium text-gray-500 mr-2">Hand:</span>
                    {player.hand.map((cardValue, index) => (
                        <div 
                            key={index}
                            className="text-xs font-semibold px-2 py-1 rounded-full text-white shadow-sm"
                            style={{ backgroundColor: color }}
                        >
                            {cardValue}
                        </div>
                    ))}
                </div>
                
                 <div className="mt-4">
                     <p className="text-sm font-bold text-gray-700 mb-1">Set Kartu P{player.id+1} Putaran Ini (<span className={`px-1 rounded ${deckLabelColor}`}>{deckType}</span>):</p>
                     <div className="flex flex-wrap gap-1">
                        {/* Menampilkan 10 kartu pertama dari total 18 kartu utuh */}
                        {currentDeck
                            .slice(0, 10).map((v, i) => (
                            <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${v <= 3 ? 'bg-red-200' : v >= 7 ? 'bg-green-200' : 'bg-yellow-200'}`}>{v}</span>
                        ))}
                         <span className="text-xs text-gray-500">
                             ... ({currentDeck.length} total)
                         </span>
                     </div>
                </div>
            </div>
        );
    };
    
    
    const currentTotalRounds = tournamentHistory.length;
    
    const ai1WinRate = currentTotalRounds > 0 ? ((ai1Wins / currentTotalRounds) * 100).toFixed(1) : 0;
    const ai2WinRate = currentTotalRounds > 0 ? ((ai2Wins / currentTotalRounds) * 100).toFixed(1) : 0;
    
    // Ambil data dek untuk tampilan preview
    const { deckP0: currentDeckP0, deckP1: currentDeckP1, deckTypeP0, deckTypeP1 } = getRoundDecks(currentRound > 0 ? currentRound : 1);

    return (
        <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-6 border-b pb-2">
                Punto AI Test Harness (Turnamen AI vs AI)
            </h1>

            {/* Panel Kontrol & Statistik */}
            <div className="mb-6 p-4 bg-white rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">
                        Putaran {currentRound} / {TOTAL_ROUNDS}
                    </h2>
                    <div className="flex space-x-3">
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
                        <button
                            onClick={handleSingleMove}
                            disabled={isRunning || !gameId || gameState?.gameOver || isSimulating}
                            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors flex items-center font-bold"
                        >
                            <ChevronsRight className="w-4 h-4 mr-2" />
                            Langkah Tunggal
                        </button>
                        <button
                            onClick={() => setIsRunning(prev => !prev)}
                            disabled={!gameId || gameState?.gameOver || isSimulating}
                            className={`px-4 py-2 rounded-lg font-bold text-white transition-colors flex items-center ${
                                isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                            }`}
                        >
                            {isRunning ? <X className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                            {isRunning ? 'JEDA SIMULASI' : 'LANJUTKAN SIMULASI'}
                        </button>
                    </div>
                </div>
                
                <div className="flex justify-center gap-10 border-t pt-4">
                    <div className="text-center">
                        <p className="text-2xl font-bold" style={{ color: PLAYER_COLORS[0] }}>{ai1Wins}</p>
                        <p className="text-sm text-gray-600">AI 1 Menang ({ai1WinRate}%)</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-gray-800">{draws}</p>
                        <p className="text-sm text-gray-600">Seri</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold" style={{ color: PLAYER_COLORS[1] }}>{ai2Wins}</p>
                        <p className="text-sm text-gray-600">AI 2 Menang ({ai2WinRate}%)</p>
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
                    
                    <div className="p-4 bg-gray-200 rounded-lg shadow-inner">
                        <h3 className="font-bold mb-2">Pengaturan Strategi</h3>
                        <div className="space-y-2">
                             <label className="block text-sm font-medium text-gray-700">AI 1 Strategy:</label>
                             <select 
                                 className="w-full p-2 border rounded-md" 
                                 value={config.strategyP0} 
                                 disabled={true} 
                             >
                                 {AI_STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                        </div>
                    </div>
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

                     <div className="p-4 bg-gray-200 rounded-lg shadow-inner">
                        <h3 className="font-bold mb-2">Pengaturan Strategi</h3>
                        <div className="space-y-2">
                             <label className="block text-sm font-medium text-gray-700">AI 2 Strategy:</label>
                             <select 
                                 className="w-full p-2 border rounded-md" 
                                 value={config.strategyP1} 
                                 disabled={true}
                             >
                                 {AI_STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Tabel Hasil Turnamen */}
            <div className="mt-8 bg-white p-6 rounded-xl shadow-lg overflow-x-auto">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Hasil Turnamen</h2>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Round</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deck P0</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deck P1</th>
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

        </div>
    );
};

export default AITournamentHarness;