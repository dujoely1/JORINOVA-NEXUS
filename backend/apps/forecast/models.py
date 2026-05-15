"""
JORINOVA NEXUS ALIS-X — Intelligent Forecast Engine
Predictive analytics for lab workload, reagents, outbreaks, blood supply, analyzers, QC
Continuous learning · Offline-first · Confidence-scored · Explainable AI
"""
from django.db import models
from django.utils import timezone
import json


class ForecastDomain(models.TextChoices):
    LAB_WORKLOAD     = 'lab_workload',      '📊 Laboratory Workload'
    REAGENT          = 'reagent',           '🧪 Reagent Consumption'
    STOCK_DEPLETION  = 'stock_depletion',   '📦 Stock Depletion'
    OUTBREAK         = 'outbreak',          '🦠 Outbreak Trends'
    BLOOD_SHORTAGE   = 'blood_shortage',    '🩸 Blood Shortage'
    ANALYZER_DOWNTIME= 'analyzer_downtime', '🔧 Analyzer Downtime'
    TAT_DELAY        = 'tat_delay',         '⏱️ TAT Delays'
    PATIENT_INFLUX   = 'patient_influx',    '🧬 Patient Influx'
    AMR_TREND        = 'amr_trend',         '🦠 AMR Resistance Trends'
    EPIDEMIC_SPREAD  = 'epidemic_spread',   '🌍 Epidemic Spread'
    EMERGENCY_DEMAND = 'emergency_demand',  '🚨 Emergency Resource Demand'
    SEASONAL_DISEASE = 'seasonal_disease',  '📅 Seasonal Disease Spikes'
    QC_FAILURE       = 'qc_failure',        '📐 QC Failure Prediction'
    MAINTENANCE      = 'maintenance',       '⚙️ Maintenance Scheduling'


class ForecastHorizon(models.TextChoices):
    H24  = '24h',  '24 Hours'
    D7   = '7d',   '7 Days'
    D30  = '30d',  '30 Days'
    D90  = '90d',  '90 Days'
    D365 = '365d', '1 Year'


class ForecastStatus(models.TextChoices):
    PENDING   = 'pending',   'Pending'
    RUNNING   = 'running',   'Running'
    READY     = 'ready',     'Ready'
    STALE     = 'stale',     'Stale — needs refresh'
    FAILED    = 'failed',    'Failed'


class ForecastModel(models.Model):
    """
    Registered forecasting model configuration for each domain.
    Supports multiple algorithms: ARIMA-lite, ETS, linear regression, seasonal decomposition.
    """
    domain         = models.CharField(max_length=25, choices=ForecastDomain.choices, unique=True)
    algorithm      = models.CharField(max_length=30, default='ets_smoothing',
                                       choices=[
                                           ('ets_smoothing',  'Exponential Triple Smoothing (ETS)'),
                                           ('linear_trend',   'Linear Trend Regression'),
                                           ('arima_lite',     'ARIMA-lite (Auto-regressive)'),
                                           ('seasonal_decomp','Seasonal Decomposition'),
                                           ('moving_avg',     'Adaptive Moving Average'),
                                           ('ensemble',       'Ensemble (ETS + Linear)'),
                                       ])
    hospital       = models.ForeignKey('core_config.Hospital', on_delete=models.CASCADE, null=True, blank=True)
    is_active      = models.BooleanField(default=True)
    learning_rate  = models.FloatField(default=0.3, help_text='Alpha for ETS / learning rate')
    seasonality    = models.PositiveSmallIntegerField(default=7, help_text='Seasonality period in days')
    min_data_points= models.PositiveSmallIntegerField(default=14, help_text='Minimum historical points needed')
    retrain_every  = models.PositiveSmallIntegerField(default=24, help_text='Retrain interval in hours')
    last_trained   = models.DateTimeField(null=True, blank=True)
    model_state    = models.JSONField(default=dict, blank=True, help_text='Serialized model weights/state')
    accuracy_mae   = models.FloatField(null=True, blank=True, help_text='Mean Absolute Error on test set')
    accuracy_mape  = models.FloatField(null=True, blank=True, help_text='Mean Absolute Percentage Error')
    notes          = models.TextField(blank=True)

    class Meta:
        ordering = ['domain']

    def __str__(self):
        return f"ForecastModel[{self.domain}] — {self.algorithm}"


class ForecastDataPoint(models.Model):
    """Historical data point used to train / validate a forecast model."""
    model          = models.ForeignKey(ForecastModel, on_delete=models.CASCADE, related_name='data_points')
    timestamp      = models.DateTimeField()
    value          = models.FloatField()
    metadata       = models.JSONField(default=dict, blank=True, help_text='e.g. district, blood_group, test_name')
    is_anomaly     = models.BooleanField(default=False)
    anomaly_score  = models.FloatField(default=0.0)

    class Meta:
        ordering  = ['model', 'timestamp']
        indexes   = [
            models.Index(fields=['model', 'timestamp']),
            models.Index(fields=['timestamp']),
        ]

    def __str__(self):
        return f"{self.model.domain} @ {self.timestamp:%Y-%m-%d %H:%M}: {self.value}"


class ForecastPrediction(models.Model):
    """
    A computed forecast result — the output of the forecasting engine.
    Contains predicted values with confidence intervals.
    """
    model          = models.ForeignKey(ForecastModel, on_delete=models.CASCADE, related_name='predictions')
    horizon        = models.CharField(max_length=5, choices=ForecastHorizon.choices)
    generated_at   = models.DateTimeField(default=timezone.now)
    valid_until    = models.DateTimeField()
    status         = models.CharField(max_length=10, choices=ForecastStatus.choices, default=ForecastStatus.PENDING)

    # Prediction payload
    predicted_values  = models.JSONField(default=list, help_text='[{ts, value, ci_low, ci_high}, ...]')
    confidence_pct    = models.SmallIntegerField(default=0, help_text='Overall model confidence 0-100')
    trend_direction   = models.CharField(max_length=10, default='stable',
                                          choices=[('up','↑ Rising'),('down','↓ Falling'),('stable','→ Stable'),('spike','⚡ Spike'),('drop','⬇ Drop')])
    trend_magnitude   = models.FloatField(default=0.0, help_text='Predicted change magnitude')
    peak_value        = models.FloatField(null=True, blank=True)
    peak_timestamp    = models.DateTimeField(null=True, blank=True)

    # AI explainability
    explanation       = models.TextField(blank=True, help_text='Human-readable AI reasoning')
    contributing_factors = models.JSONField(default=list, blank=True, help_text='[{factor, weight, direction}]')
    data_quality_score= models.SmallIntegerField(default=100, help_text='0-100 data quality for this prediction')

    # Alert thresholds
    alert_triggered   = models.BooleanField(default=False)
    alert_level       = models.CharField(max_length=15, blank=True,
                                          choices=[('info','ℹ️ Info'),('warning','⚠️ Warning'),('critical','🚨 Critical'),('emergency','🆘 Emergency')])
    alert_message     = models.TextField(blank=True)

    metadata          = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-generated_at']
        indexes  = [
            models.Index(fields=['model', 'generated_at']),
            models.Index(fields=['alert_triggered', 'alert_level']),
        ]

    def __str__(self):
        return f"Forecast[{self.model.domain}] {self.horizon} — confidence {self.confidence_pct}%"

    @property
    def is_fresh(self):
        return timezone.now() < self.valid_until

    @property
    def trend_emoji(self):
        return {'up':'📈','down':'📉','stable':'➡️','spike':'⚡','drop':'⬇️'}.get(self.trend_direction, '➡️')


class ForecastAlert(models.Model):
    """Generated alert from the forecasting engine — deduplicated, throttled."""

    class AlertType(models.TextChoices):
        THRESHOLD    = 'threshold',  '📊 Threshold Breach'
        TREND        = 'trend',      '📈 Trend Change'
        ANOMALY      = 'anomaly',    '⚠️ Anomaly Detected'
        SEASONAL     = 'seasonal',   '📅 Seasonal Pattern'
        EMERGENCY    = 'emergency',  '🆘 Emergency Forecast'

    prediction     = models.ForeignKey(ForecastPrediction, on_delete=models.CASCADE, related_name='alerts')
    alert_type     = models.CharField(max_length=15, choices=AlertType.choices)
    severity       = models.CharField(max_length=15,
                                       choices=[('info','Info'),('warning','Warning'),('critical','Critical'),('emergency','Emergency')])
    title          = models.CharField(max_length=200)
    message        = models.TextField()
    recommendation = models.TextField(blank=True)
    confidence_pct = models.SmallIntegerField(default=0)
    domain         = models.CharField(max_length=25, choices=ForecastDomain.choices)
    affected_items = models.JSONField(default=list, blank=True)
    is_acknowledged= models.BooleanField(default=False)
    acknowledged_by= models.ForeignKey('authentication.NexusUser', on_delete=models.SET_NULL, null=True, blank=True)
    acknowledged_at= models.DateTimeField(null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    expires_at     = models.DateTimeField(null=True, blank=True)
    dedup_key      = models.CharField(max_length=64, blank=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['severity', 'is_acknowledged']),
            models.Index(fields=['domain', 'created_at']),
        ]

    def __str__(self):
        return f"[{self.severity.upper()}] {self.title}"
