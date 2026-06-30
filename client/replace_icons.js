const fs = require('fs');
const path = require('path');

const gameTsxPath = path.join(__dirname, 'src', 'components', 'Game.tsx');
let content = fs.readFileSync(gameTsxPath, 'utf8');

// Replace imports
content = content.replace(
  /import { User, BarChart2, BookOpen, LogOut, Target, Clock, Key, Flame, Heart, Trophy, Skull, Activity, Shield, Check, X, Swords, Volume2, VolumeX } from 'lucide-react';/,
  `import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faChartSimple, faBookOpen, faRightFromBracket, faBullseye, faClock, faKey, faFire, faHeart, faTrophy, faChartLine, faBolt, faVolumeHigh, faVolumeXmark } from '@fortawesome/free-solid-svg-icons';`
);

// Replace tags
content = content.replace(/<Target size=\{16\} \/>/g, '<FontAwesomeIcon icon={faBullseye} style={{ fontSize: 16 }} />');
content = content.replace(/<Clock size=\{16\} \/>/g, '<FontAwesomeIcon icon={faClock} style={{ fontSize: 16 }} />');
content = content.replace(/<Key size=\{16\} \/>/g, '<FontAwesomeIcon icon={faKey} style={{ fontSize: 16 }} />');
content = content.replace(/<Flame size=\{16\} \/>/g, '<FontAwesomeIcon icon={faFire} style={{ fontSize: 16 }} />');
content = content.replace(/<Heart size=\{16\} \/>/g, '<FontAwesomeIcon icon={faHeart} style={{ fontSize: 16 }} />');
content = content.replace(/<Heart size=\{24\} fill="[^"]*" color="[^"]*" \/>/g, '<FontAwesomeIcon icon={faHeart} style={{ fontSize: 24, color: "#ef4444" }} />');
content = content.replace(/<Swords size=\{18\} \/>/g, '<FontAwesomeIcon icon={faBolt} style={{ fontSize: 18 }} />');
content = content.replace(/<Heart key=\{i\} size=\{14\} fill="[^"]*" color="[^"]*" \/>/g, '<FontAwesomeIcon key={i} icon={faHeart} style={{ fontSize: 14, color: "#ef4444" }} />');
content = content.replace(/<User size=\{18\} \/>/g, '<FontAwesomeIcon icon={faUser} style={{ fontSize: 18 }} />');
content = content.replace(/<BarChart2 size=\{16\} \/>/g, '<FontAwesomeIcon icon={faChartSimple} style={{ fontSize: 16 }} />');
content = content.replace(/<BookOpen size=\{16\} \/>/g, '<FontAwesomeIcon icon={faBookOpen} style={{ fontSize: 16 }} />');
content = content.replace(/<VolumeX size=\{16\} \/>/g, '<FontAwesomeIcon icon={faVolumeXmark} style={{ fontSize: 16 }} />');
content = content.replace(/<Volume2 size=\{16\} \/>/g, '<FontAwesomeIcon icon={faVolumeHigh} style={{ fontSize: 16 }} />');
content = content.replace(/<LogOut size=\{16\} \/>/g, '<FontAwesomeIcon icon={faRightFromBracket} style={{ fontSize: 16 }} />');
content = content.replace(/<Activity color="#4ade80" \/>/g, '<FontAwesomeIcon icon={faChartLine} style={{ fontSize: 24, color: "#4ade80" }} />');
content = content.replace(/<Flame color="#fcd34d" \/>/g, '<FontAwesomeIcon icon={faFire} style={{ fontSize: 24, color: "#fcd34d" }} />');
content = content.replace(/<Swords color="#f87171" \/>/g, '<FontAwesomeIcon icon={faBolt} style={{ fontSize: 24, color: "#f87171" }} />');
content = content.replace(/<Activity size=\{40\} \/>/g, '<FontAwesomeIcon icon={faChartLine} style={{ fontSize: 40 }} />');
content = content.replace(/<Trophy size=\{40\} \/>/g, '<FontAwesomeIcon icon={faTrophy} style={{ fontSize: 40 }} />');
content = content.replace(/<Trophy size=\{14\} style=\{\{ marginRight: '5px' \}\} \/>/g, '<FontAwesomeIcon icon={faTrophy} style={{ fontSize: 14, marginRight: "5px" }} />');

fs.writeFileSync(gameTsxPath, content);
console.log('Replaced all icons in Game.tsx');
