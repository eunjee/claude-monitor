import dayjs from 'dayjs';
import 'dayjs/locale/ko';

dayjs.locale('ko');

export default function DateNavigator({ date, onDateChange }) {
  const current = dayjs(date);
  const today = dayjs().format('YYYY-MM-DD');
  const isToday = date === today;

  const dayOfWeek = current.format('ddd');
  const display = current.format('YYYY년 MM월 DD일') + ` (${dayOfWeek})`;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onDateChange(current.subtract(1, 'day').format('YYYY-MM-DD'))}
        className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-100 text-sm"
      >
        ◀
      </button>

      <span className="text-lg font-medium text-gray-800 min-w-[220px] text-center">
        {display}
      </span>

      <button
        onClick={() => onDateChange(current.add(1, 'day').format('YYYY-MM-DD'))}
        className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-100 text-sm"
      >
        ▶
      </button>

      {!isToday && (
        <button
          onClick={() => onDateChange(today)}
          className="px-3 py-1.5 rounded-md bg-blue-500 text-white hover:bg-blue-600 text-sm"
        >
          오늘
        </button>
      )}
    </div>
  );
}
