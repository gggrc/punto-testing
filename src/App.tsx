import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Play, Loader2, Award, ChevronsRight, X } from 'lucide-react';

// URL API default (sesuaikan dengan konfigurasi Flask/Proxy Anda)
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
const TOTAL_ROUNDS = 20; // Jumlah putaran default untuk turnamen

// --- TYPESCRIPT INTERFACES ---

interface CellState {
    value: number;
    player: number; // Player ID (0 atau 1)
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
    setIndexP0: number; // Set ID yang digunakan
    setIndexP1: number;
    winner: 'AI 1' | 'AI 2' | 'Draw';
    score: string; // P0-P1 score
}

// Warna Pemain (sesuai dengan backend: 0=Merah, 1=Hijau, 2=Biru, 3=Kuning)
const PLAYER_COLORS: string[] = ['#dc2626', '#10b981', '#3b82f6', '#fcd34d'];

// --- DECK UTILITIES ---

// Fungsi untuk membuat 18 kartu (2x 1-9), diacak
const generateShuffledDeck = (): number[] => {
    const deck = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9];
    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
};

// Generate 20 fixed random decks
const generateCardSets = (count: number): number[][] => {
    const sets: number[][] = [];
    for (let i = 0; i < count; i++) {
        // Deck diisi 18 kartu, 3 ditarik ke tangan, sisa 15 untuk deckP0/P1
        const fullDeck = generateShuffledDeck();
        // Mengambil 15 kartu sisa setelah 3 kartu awal ditarik ke tangan (diurus backend)
        sets.push(fullDeck.slice(3)); 
    }
    return sets;
};

const CARD_SETS = generateCardSets(TOTAL_ROUNDS); // 20 set untuk 20 putaran
const EMPTY_DECK_PREVIEW = Array(10).fill('-'); // Placeholder untuk tampilan awal

// --- API UTILITIES ---

const apiFetch = async (endpoint: string, method: string = 'GET', body: unknown = null): Promise<GameState> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`API Error: ${error.error || response.statusText}`);
    }

    return response.json() as Promise<GameState>;
};


const AITournamentHarness: React.FC = () => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [gameId, setGameId] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>('Siap untuk memulai turnamen (20 putaran).');
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [currentRound, setCurrentRound] = useState<number>(0);
    const [tournamentHistory, setTournamentHistory] = useState<RoundResult[]>([]);
    const [ai1Wins, setAi1Wins] = useState<number>(0);
    const [ai2Wins, setAi2Wins] = useState<number>(0);
    const [draws, setDraws] = useState<number>(0);
    const [isSimulating, setIsSimulating] = useState<boolean>(false); // State untuk mengunci tombol saat sedang simulasi/berpikir

    const [config, setConfig] = useState<{ strategyP0: string, strategyP1: string }>({
        strategyP0: 'Minimax (Default)', // Default strategy P0
        strategyP1: 'Minimax (Default)', // Default strategy P1
    });
    
    // Asumsi: Backend Python yang dikirim (ai_player.py) menggunakan satu AI (Minimax). 
    const AI_STRATEGIES = ['Minimax (Default)']; 

    // --- LOGIKA GAME CONTROL ---

    const getRoundDecks = useCallback((roundNum: number): { deckP0: number[], deckP1: number[], setIndexP0: number, setIndexP1: number } => {
        let setIndex1, setIndex2;

        // Jika roundNum adalah 0, ini adalah state inisial, return data placeholder (tidak seharusnya dipanggil)
        if (roundNum <= 0) {
             // Menggunakan set 1 sebagai placeholder
             setIndex1 = 0;
             setIndex2 = TOTAL_ROUNDS / 2;
        } else if (roundNum <= TOTAL_ROUNDS / 2) {
            setIndex1 = roundNum - 1;       // Set 0 hingga 9
            setIndex2 = roundNum - 1 + (TOTAL_ROUNDS / 2); // Set 10 hingga 19
        } else {
            setIndex1 = roundNum - 1;       // Set 10 hingga 19
            setIndex2 = roundNum - 1 - (TOTAL_ROUNDS / 2);  // Set 0 hingga 9
        }
        
        return { 
            deckP0: CARD_SETS[setIndex1], 
            deckP1: CARD_SETS[setIndex2], 
            setIndexP0: setIndex1 + 1, 
            setIndexP1: setIndex2 + 1 
        };
    }, []);

    const startRound = useCallback(async (roundNum: number) => {
        // Jika roundNum melebihi batas, hentikan turnamen
        if (roundNum > TOTAL_ROUNDS) {
            setStatusMessage('Turnamen Selesai!');
            setIsRunning(false);
            return;
        }
        
        setCurrentRound(roundNum);
        setGameState(null);
        setGameId(null);
        setIsSimulating(true);
        setStatusMessage(`Memulai Putaran ${roundNum} / ${TOTAL_ROUNDS}...`);

        const { deckP0, deckP1 } = getRoundDecks(roundNum);

        try {
            const newState = await apiFetch('/start_ai_test', 'POST', {
                deckP0,
                deckP1,
            });
            setGameState(newState);
            setGameId(newState.game_id);
            setIsSimulating(false);
            
            setStatusMessage(`Putaran ${roundNum} / ${TOTAL_ROUNDS} dimulai. Giliran P${newState.currentPlayerId + 1}.`);
        } catch (error) {
            setStatusMessage(`Gagal memulai putaran ${roundNum}: ${(error as Error).message}`);
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
                // Perlu menghitung skor dari game.py jika backend tidak menyediakan
                // Karena kita tidak bisa memanggil fungsi di game.py dari frontend,
                // Kita akan asumsikan skor adalah kartu yang tersisa, atau menggunakan 
                // data sederhana dari PlayerState (walaupun tidak ideal). 
                // Untuk sementara, kita pakai string kosong karena backend tidak mengirimkan skor penuh.
                const scores = 'N/A';
                
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

                const { setIndexP0, setIndexP1 } = getRoundDecks(currentRound);

                const result: RoundResult = {
                    round: currentRound,
                    setIndexP0,
                    setIndexP1,
                    winner,
                    score: scores,
                };
                setTournamentHistory(prev => [...prev, result]);
                
                setStatusMessage(`GAME OVER Putaran ${currentRound}! Pemenang: ${winner}.`);
                setIsSimulating(false);

                // Mulai putaran berikutnya
                if (currentRound < TOTAL_ROUNDS) {
                    setTimeout(() => startRound(currentRound + 1), 1000); // Jeda 1 detik sebelum putaran baru
                } else {
                    setStatusMessage('Turnamen Selesai!');
                    setIsRunning(false);
                }

            } else {
                setStatusMessage(`Giliran P${newState.currentPlayerId + 1}.`);
                setIsSimulating(false);
            }
        } catch (error) {
            setStatusMessage(`Gagal memindahkan AI: ${(error as Error).message}`);
            setIsSimulating(false);
            setIsRunning(false);
        }
    }, [gameId, gameState, isSimulating, currentRound, startRound, getRoundDecks]);
    
    // Auto-run loop untuk turnamen
    useEffect(() => {
        let interval: number | null = null; // Diubah dari NodeJS.Timeout ke number

        if (isRunning && gameId && gameState && !gameState.gameOver && !isSimulating) {
            // Jeda 50ms untuk simulasi cepat
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

    const renderPlayerPanel = (player: PlayerState) => {
        const isCurrent = player.id === gameState?.currentPlayerId && !gameState?.gameOver;
        const isWinner = player.id === gameState?.winnerId;
        const color = PLAYER_COLORS[player.color_id];
        const playerColorName = player.id === 0 ? 'Merah' : 'Hijau'; // Berdasarkan PLAYER_COLORS[0] dan [1]
        
        // Dynamic styles for the active ring effect
        const activeStyle = isCurrent ? {
            borderColor: color,
            boxShadow: `0 0 0 4px white, 0 0 0 6px ${color}`, // Custom shadow for ring effect
            transform: 'scale(1.02)'
        } : {
            borderColor: color,
        };
        
        return (
            <div 
                className={`p-4 rounded-xl shadow-lg transition-all duration-300 bg-white border-2 ${isCurrent ? 'opacity-100' : 'opacity-90'}`}
                style={{ ...activeStyle }} // Aplikasikan style dinamis
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
            </div>
        );
    };
    
    
    // Variabel totalCardsPlayed tidak lagi dihitung di sini karena tidak digunakan di JSX
    // const totalCardsPlayed = calculateTotalCardsPlayed(); 
    const currentTotalRounds = tournamentHistory.length;
    
    const ai1WinRate = currentTotalRounds > 0 ? ((ai1Wins / currentTotalRounds) * 100).toFixed(1) : 0;
    const ai2WinRate = currentTotalRounds > 0 ? ((ai2Wins / currentTotalRounds) * 100).toFixed(1) : 0;
    
    // Ambil data dek untuk tampilan preview
    const { deckP0: currentDeckP0, deckP1: currentDeckP1 } = getRoundDecks(currentRound > 0 ? currentRound : 1);

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
                {/* Kolom Kiri: AI 1 */}
                <div className="md:col-span-1 space-y-4">
                    {gameState && gameState.players.filter(p => p.id === 0).map(p => renderPlayerPanel(p))}
                    
                    <div className="p-4 bg-gray-200 rounded-lg shadow-inner">
                        <h3 className="font-bold mb-2">Pengaturan Strategi</h3>
                        <div className="space-y-2">
                             <label className="block text-sm font-medium text-gray-700">AI 1 Strategy:</label>
                             <select 
                                 className="w-full p-2 border rounded-md" 
                                 value={config.strategyP0} 
                                 onChange={(e) => setConfig(prev => ({...prev, strategyP0: e.target.value}))}
                                 disabled={isSimulating || isRunning}
                             >
                                 {AI_STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                        </div>
                         <div className="mt-4">
                             <p className="text-sm font-bold text-gray-700 mb-1">Set Kartu P0 Putaran Ini:</p>
                             <div className="flex flex-wrap gap-1">
                                {(currentRound > 0 ? currentDeckP0 : EMPTY_DECK_PREVIEW)
                                    .slice(0, 10).map((v, i) => (
                                    <span key={i} className="text-xs bg-gray-300 px-1.5 py-0.5 rounded">{v}</span>
                                ))}
                                 <span className="text-xs text-gray-500">
                                     ... ({currentRound > 0 ? currentDeckP0.length : 15} sisa)
                                 </span>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Kolom Tengah: Papan */}
                <div className="md:col-span-1 flex justify-center items-start">
                    {renderBoard()}
                </div>

                {/* Kolom Kanan: AI 2 */}
                <div className="md:col-span-1 space-y-4">
                    {gameState && gameState.players.filter(p => p.id === 1).map(p => renderPlayerPanel(p))}

                     <div className="p-4 bg-gray-200 rounded-lg shadow-inner">
                        <h3 className="font-bold mb-2">Pengaturan Strategi</h3>
                        <div className="space-y-2">
                             <label className="block text-sm font-medium text-gray-700">AI 2 Strategy:</label>
                             <select 
                                 className="w-full p-2 border rounded-md" 
                                 value={config.strategyP1} 
                                 onChange={(e) => setConfig(prev => ({...prev, strategyP1: e.target.value}))}
                                 disabled={isSimulating || isRunning}
                             >
                                 {AI_STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                        </div>
                        <div className="mt-4">
                             <p className="text-sm font-bold text-gray-700 mb-1">Set Kartu P1 Putaran Ini:</p>
                              <div className="flex flex-wrap gap-1">
                                {(currentRound > 0 ? currentDeckP1 : EMPTY_DECK_PREVIEW)
                                    .slice(0, 10).map((v, i) => (
                                    <span key={i} className="text-xs bg-gray-300 px-1.5 py-0.5 rounded">{v}</span>
                                ))}
                                 <span className="text-xs text-gray-500">
                                     ... ({currentRound > 0 ? currentDeckP1.length : 15} sisa)
                                 </span>
                             </div>
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
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Set P0</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Set P1</th>
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
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Set {result.setIndexP0}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Set {result.setIndexP1}</td>
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