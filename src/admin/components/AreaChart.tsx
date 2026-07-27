import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

interface DataPoint {
  date: string;
  amount: number;
}

interface AreaChartProps {
  data: DataPoint[];
  accentColor?: string;
  fillColor?: string;
}

export function AreaChart({ data, accentColor = '#10b981', fillColor = 'rgba(16, 185, 129, 0.1)' }: AreaChartProps) {
  const chartData = {
    labels: data.map(d => d.date),
    datasets: [
      {
        label: 'Amount',
        data: data.map(d => d.amount),
        borderColor: accentColor,
        backgroundColor: fillColor,
        borderWidth: 2,
        pointRadius: 0,
        pointHitRadius: 10,
        tension: 0.3,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1f2937',
        titleColor: '#e5e7eb',
        bodyColor: '#d1d5db',
        borderColor: '#374151',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { color: '#6b7280', maxTicksLimit: 8 },
      },
      y: {
        grid: { color: 'rgba(107, 114, 128, 0.15)', drawBorder: false },
        ticks: {
          color: '#6b7280',
          callback: (value: number) => {
            if (value >= 1000) return `₦${(value / 1000).toFixed(0)}k`;
            return `₦${value}`;
          },
        },
      },
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
  };

  return <Line data={chartData} options={options} />;
}
