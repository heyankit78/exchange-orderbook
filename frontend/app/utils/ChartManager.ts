import {
  ColorType,
  createChart as createLightWeightChart,
  CrosshairMode,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";

type CandleUpdate = {
  time: number; // milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
};

export class ChartManager {
  private candleSeries: ISeriesApi<"Candlestick">;
  private chart: any;

  constructor(
    ref: any,
    initialData: any[],
    layout: {
      background: string;
      color: string;
    },
  ) {
    const chart = createLightWeightChart(ref, {
      autoSize: true,

      overlayPriceScales: {
        ticksVisible: true,
        borderVisible: true,
      },

      crosshair: {
        mode: CrosshairMode.Normal,
      },

      rightPriceScale: {
        visible: true,
        ticksVisible: true,
        entireTextOnly: true,
      },

      grid: {
        horzLines: {
          visible: false,
        },

        vertLines: {
          visible: false,
        },
      },

      layout: {
        background: {
          type: ColorType.Solid,
          color: layout.background,
        },

        textColor: layout.color,
      },
    });

    this.chart = chart;

    this.candleSeries = chart.addCandlestickSeries();

    this.candleSeries.setData(
      initialData.map((data) => ({
        time: Math.floor(
          new Date(data.timestamp).getTime() / 1000,
        ) as UTCTimestamp,

        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
      })),
    );

    chart.timeScale().fitContent();
  }

  public update(candle: CandleUpdate) {
    this.candleSeries.update({
      time: Math.floor(candle.time / 1000) as UTCTimestamp,

      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
  }

  public destroy() {
    this.chart.remove();
  }
}
