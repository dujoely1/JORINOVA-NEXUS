"""Records Module Views — Lab Books + Shift Intelligence"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.utils import timezone

BOOK_CONFIG = {
    'hematology':   {'name':'🔴 Hematology Book',     'tube':'purple',   'gradient':'linear-gradient(135deg,#1A0035 0%,#4A0E82 45%,#7B2FBE 100%)','accent':'#9B59B6','text':'#EDD9FF','data-book':'hematology'},
    'blood_group':  {'name':'🩸 Blood Group Book',     'tube':'purple',   'gradient':'linear-gradient(135deg,#1A0035 0%,#4A0E82 45%,#7B2FBE 100%)','accent':'#9B59B6','text':'#EDD9FF','data-book':'blood-group'},
    'crossmatch':   {'name':'🧪 Crossmatch Book',      'tube':'purple',   'gradient':'linear-gradient(135deg,#1A0035 0%,#4A0E82 45%,#7B2FBE 100%)','accent':'#9B59B6','text':'#EDD9FF','data-book':'crossmatch'},
    'chemistry':    {'name':'🧫 Chemistry Book',        'tube':'red_yellow','gradient':'linear-gradient(135deg,#5A0000 0%,#A01A00 45%,#CC5500 75%,#E8960A 100%)','accent':'#F39C12','text':'#FFF0CC','data-book':'chemistry'},
    'serology':     {'name':'🔬 Serology Book',         'tube':'red_yellow','gradient':'linear-gradient(135deg,#5A0000 0%,#A01A00 45%,#CC5500 75%,#E8960A 100%)','accent':'#F39C12','text':'#FFF0CC','data-book':'serology'},
    'coagulation':  {'name':'💙 Coagulation Book',      'tube':'blue',     'gradient':'linear-gradient(135deg,#001233 0%,#0A2A6A 45%,#1A5096 100%)','accent':'#2980B9','text':'#C8E8FF','data-book':'coagulation'},
    'glucose':      {'name':'💚 Glucose / Metabolic',   'tube':'fluoride', 'gradient':'linear-gradient(135deg,#002210 0%,#0A5025 45%,#1A8A40 100%)','accent':'#27AE60','text':'#C8FFE0','data-book':'glucose'},
    'metabolic':    {'name':'🌿 Metabolic Panel',       'tube':'fluoride', 'gradient':'linear-gradient(135deg,#002210 0%,#0A5025 45%,#1A8A40 100%)','accent':'#27AE60','text':'#C8FFE0','data-book':'metabolic'},
    'microbiology': {'name':'🦠 Microbiology Book',     'tube':'teal',     'gradient':'linear-gradient(135deg,#001A20 0%,#004455 45%,#006680 100%)','accent':'#00BCD4','text':'#B2EBF2','data-book':'microbiology'},
    'urinalysis':   {'name':'🟡 Urinalysis Book',       'tube':'yellow',   'gradient':'linear-gradient(135deg,#332200 0%,#664400 45%,#CC8800 100%)','accent':'#F1C40F','text':'#FFF9C4','data-book':'urinalysis'},
    'blood_bank':   {'name':'🩸 Blood Bank Book',       'tube':'red',      'gradient':'linear-gradient(135deg,#3A0000 0%,#8B0000 50%,#CC0000 100%)','accent':'#E74C3C','text':'#FFCDD2','data-book':'blood-bank'},
    'parasitology': {'name':'🔵 Parasitology Book',     'tube':'blue',     'gradient':'linear-gradient(135deg,#001233 0%,#0A2A6A 45%,#1A5096 100%)','accent':'#3498DB','text':'#C8E8FF','data-book':'parasitology'},
}


@login_required
def records_index(request):
    """Lab book index — shows all active books."""
    return render(request, 'records_index.html', {
        'page_title': '📚 Lab Records — ALIS-X',
        'today':      timezone.now().date(),
        'books':      list(BOOK_CONFIG.items()),
    })


@login_required
def book_view(request, book_type):
    """Individual lab book view — records + entry form."""
    cfg = BOOK_CONFIG.get(book_type)
    if not cfg:
        from django.http import Http404
        raise Http404('Lab book not found')
    return render(request, 'records_book.html', {
        'page_title': f'{cfg["name"]} — ALIS-X',
        'today':      timezone.now().date(),
        'book_type':  book_type,
        'book':       cfg,
    })


@login_required
def api_book_records(request, book_type):
    """List records for a lab book with shift info."""
    try:
        from .models import LabRecord, LabBook
        book = LabBook.objects.filter(book_type=book_type).first()
        if not book:
            return JsonResponse({'records': [], 'total': 0})
        qs = LabRecord.objects.filter(lab_book=book).select_related('patient', 'entered_by')
        page  = int(request.GET.get('page', 1))
        limit = int(request.GET.get('limit', 25))
        total = qs.count()
        records = list(qs.values(
            'record_id', 'shift', 'shift_icon', 'status',
            'results', 'notes', 'created_at',
            'patient__pid', 'patient__family_name', 'patient__given_name',
            'entered_by__username',
        )[(page-1)*limit:page*limit])
        for r in records:
            r['created_at'] = r['created_at'].isoformat() if r['created_at'] else ''
        return JsonResponse({'records': records, 'total': total})
    except Exception as e:
        return JsonResponse({'records': [], 'total': 0, 'error': str(e)})


@login_required
def api_current_shift(request):
    """Return current shift based on system config."""
    now  = timezone.localtime().time()
    hour = now.hour
    if 6 <= hour < 14:
        shift, icon = 'Morning', '☀️'
    elif 14 <= hour < 22:
        shift, icon = 'Afternoon', '🌤️'
    else:
        shift, icon = 'Night', '🌙'
    return JsonResponse({
        'shift': shift,
        'icon':  icon,
        'time':  now.strftime('%H:%M'),
        'source':'auto-detect',
    })
